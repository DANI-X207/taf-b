const express = require("express");
const bcrypt = require("bcrypt");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanEmail, cleanPassword } = require("../helpers");
const { getCurrentUser, isAuthenticated } = require("../middleware");
const { authPageHtml } = require("./pages");

const router = express.Router();

function loginUser(req, userId) {
  req.session.regenerate((err) => {});
  req.session.user_id = parseInt(userId);
  req.session.save(() => {});
}

router.post("/auth/register", async (req, res) => {
  const data = req.body || {};
  try {
    const name = cleanText(data.name || data.username, 120, true);
    const email = cleanEmail(data.email);
    const password = cleanPassword(data.password);
    const hash = await bcrypt.hash(password, 12);
    const db = getDb();
    let userId;
    try {
      const result = db.prepare(
        "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)"
      ).run(name, email, hash, nowIso());
      userId = result.lastInsertRowid;
    } catch (e) {
      db.close();
      const msg = "Un compte existe déjà avec cet email. Connectez-vous directement.";
      if (req.is("json")) return res.status(409).json({ error: msg });
      return res.status(409).send(authPageHtml(msg));
    }
    db.close();
    req.session.user_id = userId;
    if (req.is("json")) return res.status(201).json({ success: true });
    return res.redirect("/");
  } catch (e) {
    if (req.is("json")) return res.status(400).json({ error: e.message });
    return res.status(400).send(authPageHtml(e.message));
  }
});

router.post("/auth/login", async (req, res) => {
  const data = req.body || {};
  try {
    const email = cleanEmail(data.email);
    const password = String(data.password || "");
    const db = getDb();
    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
    if (!row || !(await bcrypt.compare(password, row.password_hash))) {
      db.close();
      const msg = "Email ou mot de passe incorrect.";
      if (req.is("json")) return res.status(401).json({ error: msg });
      return res.status(401).send(authPageHtml(msg));
    }
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(nowIso(), row.id);
    db.close();
    req.session.user_id = row.id;
    if (req.is("json")) return res.json({ success: true });
    return res.redirect("/");
  } catch (e) {
    if (req.is("json")) return res.status(400).json({ error: e.message });
    return res.status(400).send(authPageHtml(e.message));
  }
});

router.all("/auth/logout", (req, res) => {
  req.session.destroy(() => {});
  if (req.is("json")) return res.json({ success: true });
  return res.redirect("/login.html");
});

router.get("/api/auth/status", (req, res) => {
  const user = getCurrentUser(req);
  res.json({ authenticated: isAuthenticated(req), user, admin: !!req.session.admin_authenticated });
});

router.post("/api/auth/register", (req, res, next) => {
  req.url = "/auth/register";
  router.handle(req, res, next);
});
router.post("/api/auth/login", (req, res, next) => {
  req.url = "/auth/login";
  router.handle(req, res, next);
});
router.post("/api/auth/logout", (req, res, next) => {
  req.session.destroy(() => {});
  res.json({ success: true });
});

module.exports = router;
