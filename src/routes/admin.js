const express = require("express");
const crypto = require("crypto");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanUrl } = require("../helpers");
const { requireAdmin } = require("../middleware");

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "TAF1-FLEMME";
const ADMIN_PASSWORD_SUPER = process.env.ADMIN_PASSWORD_SUPER || "MMDE2007";

function safeEqual(a, b) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && crypto.timingSafeEqual(A, B);
}

const ORDER_STATUSES = ["En attente", "Confirmée", "En livraison", "Livrée", "Annulée"];

function rowToOrder(row, items = []) {
  const order = { ...row };
  order.items = items;
  const created = new Date(row.created_at + "Z");
  const deadline = new Date(created.getTime() + 5 * 60 * 1000);
  order.can_cancel = ["En attente", "Confirmée"].includes(row.status) && new Date() <= deadline;
  order.tracking_steps = ORDER_STATUSES.slice(0, -1);
  return order;
}

function tryValidateOrder(db, orderId) {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) return order;
  if (order.admin_confirmed && order.client_confirmed && order.status !== "Validée") {
    const now = nowIso();
    db.prepare("UPDATE orders SET status = 'Validée', validated_at = ?, updated_at = ? WHERE id = ?").run(now, now, orderId);
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  }
  return order;
}

router.get("/api/admin/status", (req, res) => {
  res.json({
    authenticated: !!req.session.admin_authenticated,
    role: req.session.admin_role || (req.session.admin_authenticated ? "normal" : null),
  });
});

router.post("/api/admin/login", (req, res) => {
  const data = req.body || {};
  const password = String(data.password || "");
  if (safeEqual(password, ADMIN_PASSWORD_SUPER)) {
    req.session.admin_authenticated = true;
    req.session.admin_role = "super";
    return res.json({ success: true, role: "super" });
  }
  if (safeEqual(password, ADMIN_PASSWORD)) {
    req.session.admin_authenticated = true;
    req.session.admin_role = "normal";
    return res.json({ success: true, role: "normal" });
  }
  return res.status(401).json({ error: "Mot de passe administrateur incorrect." });
});

router.post("/api/admin/logout", (req, res) => {
  req.session.admin_authenticated = false;
  req.session.admin_role = null;
  res.json({ success: true });
});

router.get("/api/admin/users", requireAdmin(), (req, res) => {
  const db = getDb();
  const users = db.prepare(
    "SELECT id, name, email, created_at, last_login_at, is_active FROM users ORDER BY id DESC"
  ).all();
  const withDetails = users.map((u) => {
    const orderRow = db.prepare("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total_spent FROM orders WHERE user_id = ?").get(u.id);
    return {
      ...u,
      is_active: u.is_active === undefined ? 1 : u.is_active,
      order_count: orderRow ? orderRow.cnt : 0,
      total_spent: orderRow ? orderRow.total_spent : 0,
    };
  });
  db.close();
  res.json(withDetails);
});

router.put("/api/admin/users/:id/toggle-status", requireAdmin(), (req, res) => {
  const db = getDb();
  const user = db.prepare("SELECT id, is_active FROM users WHERE id = ?").get(parseInt(req.params.id));
  if (!user) { db.close(); return res.status(404).json({ error: "Utilisateur non trouvé." }); }
  const newActive = user.is_active ? 0 : 1;
  db.prepare("UPDATE users SET is_active = ? WHERE id = ?").run(newActive, user.id);
  db.close();
  res.json({ success: true, is_active: newActive });
});

router.delete("/api/admin/users/:id", requireAdmin(), (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM users WHERE id = ?").run(parseInt(req.params.id));
  db.close();
  res.json({ success: true });
});

router.get("/api/admin/orders", requireAdmin(), (req, res) => {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
  const orders = rows.map((row) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id);
    return rowToOrder(row, items);
  });
  db.close();
  res.json(orders);
});

router.put("/api/admin/orders/:id/status", requireAdmin(), (req, res) => {
  const data = req.body || {};
  const status = cleanText(data.status, 40, true);
  if (!ORDER_STATUSES.includes(status))
    return res.status(400).json({ error: "Statut invalide." });
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const now = nowIso();

  const adminConfirmed = status === "Livrée" ? 1 : (status === "En attente" ? 0 : undefined);
  if (adminConfirmed !== undefined) {
    db.prepare("UPDATE orders SET status = ?, admin_confirmed = ?, updated_at = ? WHERE id = ?").run(status, adminConfirmed, now, orderId);
  } else {
    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, now, orderId);
  }

  const updatedOrder = tryValidateOrder(db, orderId);
  if (!updatedOrder) { db.close(); return res.status(404).json({ error: "Commande non trouvée." }); }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
  db.close();
  res.json(rowToOrder(updatedOrder, items));
});

router.post("/api/admin/orders/:id/status", requireAdmin(), (req, res, next) => {
  req.method = "PUT";
  next();
});

router.get("/api/admin/ads", requireAdmin(), (req, res) => {
  const db = getDb();
  const ads = db.prepare("SELECT * FROM ads ORDER BY id DESC").all();
  db.close();
  res.json(ads);
});

router.post("/api/admin/ads", requireAdmin(), (req, res) => {
  const data = req.body || {};
  try {
    const title = cleanText(data.title, 160, true);
    const message = cleanText(data.message, 500, true);
    const link = cleanUrl(data.link, 500);
    const db = getDb();
    const result = db.prepare("INSERT INTO ads (title, message, link, active, created_at) VALUES (?,?,?,?,?)").run(title, message, link, data.active !== false ? 1 : 0, nowIso());
    const ad = db.prepare("SELECT * FROM ads WHERE id = ?").get(result.lastInsertRowid);
    db.close();
    return res.status(201).json(ad);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.delete("/api/admin/ads/:id", requireAdmin(), (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM ads WHERE id = ?").run(parseInt(req.params.id));
  db.close();
  res.json({ success: true });
});

module.exports = router;
