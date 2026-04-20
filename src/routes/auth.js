const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanEmail, cleanPassword, cleanPhone } = require("../helpers");
const { getCurrentUser, isAuthenticated } = require("../middleware");
const { authPageHtml } = require("./pages");

const router = express.Router();

const RESET_TOKEN_TTL_MINUTES = 15;

router.post("/auth/register", async (req, res) => {
  const data = req.body || {};
  try {
    const name = cleanText(data.name || data.username, 120, true);
    const email = cleanEmail(data.email);
    const password = cleanPassword(data.password);
    const phone = data.phone ? cleanPhone(data.phone) : "";
    const hash = await bcrypt.hash(password, 12);
    const db = getDb();
    let userId;
    try {
      const result = db.prepare(
        "INSERT INTO users (name, email, password_hash, phone, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(name, email, hash, phone, nowIso());
      userId = result.lastInsertRowid;
    } catch (e) {
      db.close();
      const msg = "Un compte existe déjà avec cet email ou ce nom d'utilisateur.";
      if (req.is("json")) return res.status(409).json({ error: msg, redirectTo: "/login.html" });
      return res.redirect("/login.html?info=" + encodeURIComponent("Compte déjà existant. Connectez-vous."));
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
    const identifier = cleanText(data.email || data.username || data.identifier || "", 180, true);
    const password = String(data.password || "");
    const db = getDb();
    let matchedRow = null;
    const isEmail = identifier.includes("@");
    if (isEmail) {
      const row = db.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(identifier);
      if (row && await bcrypt.compare(password, row.password_hash)) matchedRow = row;
    } else {
      const candidates = db.prepare("SELECT * FROM users WHERE LOWER(name) = LOWER(?)").all(identifier);
      for (const candidate of candidates) {
        if (await bcrypt.compare(password, candidate.password_hash)) {
          matchedRow = candidate;
          break;
        }
      }
    }
    if (!matchedRow) {
      db.close();
      const msg = "Identifiant ou mot de passe incorrect.";
      if (req.is("json")) return res.status(401).json({ error: msg });
      return res.status(401).send(authPageHtml(msg));
    }
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(nowIso(), matchedRow.id);
    db.close();
    req.session.user_id = matchedRow.id;
    if (req.is("json")) return res.json({ success: true });
    return res.redirect("/");
  } catch (e) {
    if (req.is("json")) return res.status(400).json({ error: e.message });
    return res.status(400).send(authPageHtml(e.message));
  }
});

router.all("/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("magma_sid");
    if (req.is("json")) return res.json({ success: true });
    return res.redirect("/login.html");
  });
});

router.post("/api/auth/forgot-password", async (req, res) => {
  const data = req.body || {};
  try {
    const name = cleanText(data.name, 120, true);
    const phone = cleanPhone(data.phone);
    const email = cleanEmail(data.email);

    const db = getDb();

    const user = db.prepare(
      "SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND LOWER(name) = LOWER(?)"
    ).get(email, name);

    if (!user) {
      db.close();
      return res.status(404).json({ error: "Aucun compte ne correspond à ces informations. Vérifiez votre nom, téléphone et email." });
    }

    const userPhone = (user.phone || "").replace(/[\s\-().]/g, "");
    const inputPhone = phone.replace(/[\s\-().]/g, "");

    if (!userPhone || userPhone !== inputPhone) {
      db.close();
      return res.status(404).json({ error: "Aucun compte ne correspond à ces informations. Vérifiez votre nom, téléphone et email." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000)
      .toISOString().replace(/\.\d{3}Z$/, "");

    db.prepare(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)"
    ).run(user.id, token, expiresAt, nowIso());

    db.exec("DELETE FROM password_reset_tokens WHERE expires_at < datetime('now') AND used_at IS NULL");

    db.close();

    return res.json({ success: true, token, expires_in_minutes: RESET_TOKEN_TTL_MINUTES });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.get("/api/auth/check-reset-token", (req, res) => {
  const token = cleanText(req.query.token || "", 128);
  if (!token) return res.json({ valid: false, reason: "missing" });
  const db = getDb();
  const record = db.prepare("SELECT * FROM password_reset_tokens WHERE token = ?").get(token);
  db.close();
  if (!record) return res.json({ valid: false, reason: "not_found" });
  if (record.used_at) return res.json({ valid: false, reason: "already_used" });
  const expiresAt = new Date(record.expires_at + "Z");
  if (new Date() > expiresAt) return res.json({ valid: false, reason: "expired" });
  return res.json({ valid: true });
});

router.post("/api/auth/reset-password", async (req, res) => {
  const data = req.body || {};
  try {
    const token = cleanText(data.token, 128, true);
    const password = cleanPassword(data.password);

    const db = getDb();

    const record = db.prepare(
      "SELECT * FROM password_reset_tokens WHERE token = ?"
    ).get(token);

    if (!record) {
      db.close();
      return res.status(400).json({ error: "Lien de réinitialisation invalide ou inexistant." });
    }

    if (record.used_at) {
      db.close();
      return res.status(400).json({ error: "Ce lien a déjà été utilisé. Veuillez faire une nouvelle demande." });
    }

    const expiresAt = new Date(record.expires_at + "Z");
    if (new Date() > expiresAt) {
      db.close();
      return res.status(400).json({ error: "Ce lien a expiré (validité : 15 minutes). Veuillez faire une nouvelle demande." });
    }

    const hash = await bcrypt.hash(password, 12);
    const now = nowIso();

    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, record.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now, record.id);

    db.close();

    req.session.destroy(() => {
      res.clearCookie("magma_sid");
      res.json({ success: true });
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
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
router.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("magma_sid");
    res.json({ success: true });
  });
});

module.exports = router;
