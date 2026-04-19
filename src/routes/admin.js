const express = require("express");
const crypto = require("crypto");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanUrl } = require("../helpers");
const { requireAdmin } = require("../middleware");

const router = express.Router();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "TAF1-FLEMME";

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

router.get("/api/admin/status", (req, res) => {
  res.json({ authenticated: !!req.session.admin_authenticated });
});

router.post("/api/admin/login", (req, res) => {
  const data = req.body || {};
  const password = String(data.password || "");
  const expected = Buffer.from(ADMIN_PASSWORD);
  const provided = Buffer.from(password);
  if (expected.length === provided.length && crypto.timingSafeEqual(expected, provided)) {
    req.session.admin_authenticated = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "Mot de passe administrateur incorrect." });
});

router.post("/api/admin/logout", (req, res) => {
  req.session.admin_authenticated = false;
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
    return res.status(400).json({ error: "Statut invalide. Utilisez : En attente, Confirmée, En livraison, Livrée." });
  const db = getDb();
  const result = db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), parseInt(req.params.id));
  if (result.changes === 0) { db.close(); return res.status(404).json({ error: "Commande non trouvée" }); }
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(parseInt(req.params.id));
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(parseInt(req.params.id));
  db.close();
  res.json(rowToOrder(order, items));
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
