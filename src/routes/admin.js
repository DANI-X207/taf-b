const express = require("express");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanUrl } = require("../helpers");
const { requireAdmin } = require("../middleware");

const router = express.Router();

const COVERS_DIR = path.join(__dirname, "..", "..", "public", "uploads", "covers");
fs.mkdirSync(COVERS_DIR, { recursive: true });

const ALLOWED_MIME = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif" };

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, COVERS_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_MIME[file.mimetype] || path.extname(file.originalname).toLowerCase() || ".bin";
    cb(null, crypto.randomBytes(8).toString("hex") + ext);
  },
});
const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME[file.mimetype]) return cb(new Error("Format d'image non supporté (PNG, JPG, WEBP, GIF uniquement)."));
    cb(null, true);
  },
});

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

async function tryValidateOrder(db, orderId) {
  const order = await db.get("SELECT * FROM orders WHERE id = ?", orderId);
  if (!order) return order;
  if (order.admin_confirmed && order.client_confirmed && order.status !== "Validée") {
    const now = nowIso();
    await db.run("UPDATE orders SET status = 'Validée', validated_at = ?, updated_at = ? WHERE id = ?", now, now, orderId);
    return await db.get("SELECT * FROM orders WHERE id = ?", orderId);
  }
  return order;
}

// Mirrored from src/routes/auth.js so admin status auto-detects from the
// logged-in user's phone (parity with Flask app.py).
const ADMIN_PHONES_STATUS = {
  "065487909": { is_super: true },
  "050271841": { is_super: false },
  "064280982": { is_super: false },
  "066342094": { is_super: false },
  "066059986": { is_super: false },
  "069680847": { is_super: false },
};

router.get("/api/admin/status", async (req, res) => {
  // If not yet flagged, see if the current logged-in user's phone matches an admin number.
  if (!req.session.admin_authenticated && req.session.user_id) {
    try {
      const db = await getDb();
      const user = await db.get("SELECT phone FROM users WHERE id = ?", req.session.user_id);
      const norm = String((user && user.phone) || "").replace(/\D+/g, "");
      const info = ADMIN_PHONES_STATUS[norm];
      if (info) {
        req.session.admin_authenticated = true;
        req.session.admin_role = info.is_super ? "super" : "normal";
        req.session.admin_via_phone = true;
      }
    } catch (e) { /* ignore — fall through */ }
  }
  res.json({
    authenticated: !!req.session.admin_authenticated,
    role: req.session.admin_role || (req.session.admin_authenticated ? "normal" : null),
    is_super: req.session.admin_role === "super",
    via_phone: !!req.session.admin_via_phone,
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

router.get("/api/admin/users", requireAdmin(), async (req, res) => {
  try {
    const db = await getDb();
    const users = await db.all(
      "SELECT id, name, email, created_at, last_login_at, is_active FROM users ORDER BY id DESC"
    );
    const withDetails = [];
    for (const u of users) {
      const orderRow = await db.get("SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total_spent FROM orders WHERE user_id = ?", u.id);
      withDetails.push({
        ...u,
        is_active: u.is_active === undefined || u.is_active === null ? 1 : u.is_active,
        order_count: orderRow ? orderRow.cnt : 0,
        total_spent: orderRow ? orderRow.total_spent : 0,
      });
    }
    res.json(withDetails);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put("/api/admin/users/:id/toggle-status", requireAdmin(), async (req, res) => {
  try {
    const db = await getDb();
    const user = await db.get("SELECT id, is_active FROM users WHERE id = ?", parseInt(req.params.id));
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé." });
    const newActive = user.is_active ? 0 : 1;
    await db.run("UPDATE users SET is_active = ? WHERE id = ?", newActive, user.id);
    res.json({ success: true, is_active: newActive });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete("/api/admin/users/:id", requireAdmin(), async (req, res) => {
  try {
    const db = await getDb();
    await db.run("DELETE FROM users WHERE id = ?", parseInt(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/api/admin/orders", requireAdmin(), async (req, res) => {
  try {
    const db = await getDb();
    const rows = await db.all("SELECT * FROM orders ORDER BY id DESC");
    const orders = [];
    for (const row of rows) {
      const items = await db.all("SELECT * FROM order_items WHERE order_id = ?", row.id);
      orders.push(rowToOrder(row, items));
    }
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const ALLOWED_TRANSITIONS = {
  "En attente": ["Confirmée", "Annulée"],
  "Confirmée": ["En livraison", "Annulée"],
  "En livraison": ["Livrée"],
  "Livrée": ["Validée"],
  "Validée": [],
  "Reçue": [],
  "Annulée": [],
};

router.put("/api/admin/orders/:id/status", requireAdmin(), async (req, res) => {
  try {
    const data = req.body || {};
    const status = cleanText(data.status, 40, true);
    if (!ORDER_STATUSES.includes(status))
      return res.status(400).json({ error: "Statut invalide." });
    const db = await getDb();
    const orderId = parseInt(req.params.id);
    const current = await db.get("SELECT * FROM orders WHERE id = ?", orderId);
    if (!current) return res.status(404).json({ error: "Commande non trouvée." });
    if (current.status === status) return res.status(400).json({ error: "Le statut est déjà « " + status + " »." });
    const allowed = ALLOWED_TRANSITIONS[current.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: "Transition interdite : « " + current.status + " » → « " + status + " ». Une commande confirmée ne peut pas revenir en attente, et une commande en livraison ne peut pas être remise en confirmée." });
    }
    const now = nowIso();
    const adminConfirmed = (status === "Confirmée" || status === "En livraison" || status === "Livrée") ? 1 : undefined;
    if (adminConfirmed !== undefined) {
      await db.run("UPDATE orders SET status = ?, admin_confirmed = ?, updated_at = ? WHERE id = ?", status, adminConfirmed, now, orderId);
    } else {
      await db.run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", status, now, orderId);
    }

    const updatedOrder = await tryValidateOrder(db, orderId);
    const items = await db.all("SELECT * FROM order_items WHERE order_id = ?", orderId);
    res.json(rowToOrder(updatedOrder, items));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/api/admin/orders/:id/status", requireAdmin(), (req, res, next) => {
  req.method = "PUT";
  next();
});

router.post("/api/admin/upload-cover", requireAdmin(), (req, res) => {
  uploadCover.single("file")(req, res, (err) => {
    if (err) {
      const msg = err.code === "LIMIT_FILE_SIZE"
        ? "Image trop volumineuse (max 5 Mo)."
        : (err.message || "Téléversement impossible.");
      return res.status(400).json({ error: msg });
    }
    if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
    return res.json({ success: true, url: "/uploads/covers/" + req.file.filename });
  });
});

module.exports = router;
