const express = require("express");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanEmail, cleanPassword, cleanPhone, normalizePhone, escapeHtml } = require("../helpers");
const { getCurrentUser, isAuthenticated } = require("../middleware");
const { authPageHtml } = require("./pages");

const router = express.Router();

function loginUser(req, userId) {
  req.session.regenerate((err) => {});
  req.session.user_id = parseInt(userId);
  req.session.save(() => {});
}

function resetPasswordHtml(content) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Librairie Magma — Réinitialisation</title><style>body{margin:0;min-height:100vh;background:#e8e8e8;font-family:Arial,sans-serif;color:#333;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}main{width:min(480px,100%);background:#fff;border-radius:6px;padding:34px;box-shadow:0 8px 32px rgba(0,0,0,.18);}h1{font-size:26px;font-weight:400;color:#888;margin:0 0 18px;}label{display:block;font-size:13px;color:#555;margin:14px 0 6px;}input{width:100%;padding:10px 12px;border:1px solid #ccc;border-radius:3px;font-size:14px;background:#f0f0f0;color:#333;box-sizing:border-box;}button,.link{display:inline-block;width:100%;padding:13px;background:#ff690c;color:#fff;font-size:15px;font-weight:600;border:none;border-radius:3px;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box;margin-top:18px;}.error{background:#fee4e2;color:#b42318;padding:10px 14px;border-radius:4px;font-size:13px;}.success{background:#ecfdf3;color:#1f7a4d;padding:10px 14px;border-radius:4px;font-size:13px;}.small{font-size:13px;color:#888;line-height:1.5;word-break:break-word;}</style></head><body><main>${content}</main></body></html>`;
}

function buildResetLink(req, token) {
  return `${req.protocol}://${req.get("host")}/reset-password?token=${encodeURIComponent(token)}`;
}

function tokenIsValid(row) {
  return row && !row.used_at && new Date(row.expires_at).getTime() > Date.now();
}

function phoneMatchesUser(db, user, phone) {
  const normalized = normalizePhone(phone);
  if (normalizePhone(user.phone) === normalized) return true;
  const orders = db.prepare("SELECT customer_phone FROM orders WHERE user_id = ? OR (LOWER(customer_email) = LOWER(?) AND LOWER(customer_name) = LOWER(?))").all(user.id, user.email, user.name);
  return orders.some((order) => normalizePhone(order.customer_phone) === normalized);
}

router.post("/auth/register", async (req, res) => {
  const data = req.body || {};
  try {
    const name = cleanText(data.name || data.username, 120, true);
    const email = cleanEmail(data.email);
    const phone = cleanPhone(data.phone || data.telephone);
    const password = cleanPassword(data.password);
    const hash = await bcrypt.hash(password, 12);
    const db = getDb();
    let userId;
    try {
      const result = db.prepare(
        "INSERT INTO users (name, email, phone, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
      ).run(name, email, phone, hash, nowIso());
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

router.post("/api/auth/forgot-password", (req, res) => {
  const data = req.body || {};
  let db;
  try {
    const name = cleanText(data.name, 120, true);
    const phone = cleanPhone(data.phone || data.telephone);
    const email = cleanEmail(data.email);
    db = getDb();
    db.prepare("DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at <= ?").run(new Date().toISOString());
    const user = db.prepare("SELECT * FROM users WHERE LOWER(name) = LOWER(?) AND LOWER(email) = LOWER(?) AND COALESCE(is_active, 1) = 1").get(name, email);
    if (!user || !phoneMatchesUser(db, user, phone)) {
      db.close();
      return res.status(400).json({ error: "Les informations saisies ne correspondent à aucun compte client." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)").run(user.id, token, expiresAt, nowIso());
    db.close();
    const resetLink = buildResetLink(req, token);
    return res.json({ success: true, message: "Lien de réinitialisation généré. Il expire dans 15 minutes.", resetLink });
  } catch (e) {
    if (db) db.close();
    return res.status(400).json({ error: e.message || "Impossible de vérifier les informations." });
  }
});

router.post("/auth/forgot-password", (req, res) => {
  const data = req.body || {};
  let db;
  try {
    const name = cleanText(data.name, 120, true);
    const phone = cleanPhone(data.phone || data.telephone);
    const email = cleanEmail(data.email);
    db = getDb();
    db.prepare("DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at <= ?").run(new Date().toISOString());
    const user = db.prepare("SELECT * FROM users WHERE LOWER(name) = LOWER(?) AND LOWER(email) = LOWER(?) AND COALESCE(is_active, 1) = 1").get(name, email);
    if (!user || !phoneMatchesUser(db, user, phone)) {
      db.close();
      return res.status(400).send(resetPasswordHtml(`<h1>Mot de passe oublié</h1><p class="error">Les informations saisies ne correspondent à aucun compte client.</p><a class="link" href="/login.html">Retour</a>`));
    }
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO password_reset_tokens (user_id, token, expires_at, created_at) VALUES (?, ?, ?, ?)").run(user.id, token, expiresAt, nowIso());
    db.close();
    const resetLink = buildResetLink(req, token);
    return res.send(resetPasswordHtml(`<h1>Lien de réinitialisation</h1><p class="success">Lien généré. Il expire dans 15 minutes.</p><p class="small"><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p><a class="link" href="${escapeHtml(resetLink)}">Saisir un nouveau mot de passe</a>`));
  } catch (e) {
    if (db) db.close();
    return res.status(400).send(resetPasswordHtml(`<h1>Mot de passe oublié</h1><p class="error">${escapeHtml(e.message || "Impossible de vérifier les informations.")}</p><a class="link" href="/login.html">Retour</a>`));
  }
});

router.get("/reset-password", (req, res) => {
  const token = cleanText(req.query.token, 200);
  const db = getDb();
  db.prepare("DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at <= ?").run(new Date().toISOString());
  const row = token ? db.prepare("SELECT * FROM password_reset_tokens WHERE token = ?").get(token) : null;
  db.close();
  if (!tokenIsValid(row)) {
    return res.status(400).send(resetPasswordHtml(`<h1>Réinitialisation</h1><p class="error">Ce lien est invalide ou expiré. Demandez un nouveau lien depuis la page de connexion.</p><a class="link" href="/login.html">Retour à la connexion</a>`));
  }
  return res.send(resetPasswordHtml(`<h1>Nouveau mot de passe</h1><p class="small">Saisissez un nouveau mot de passe. Le lien sera désactivé après validation.</p><form method="post" action="/auth/reset-password"><input type="hidden" name="token" value="${escapeHtml(token)}"><label>Nouveau mot de passe</label><input name="password" type="password" required minlength="8" autocomplete="new-password"><button type="submit">Réinitialiser</button></form>`));
});

router.post("/auth/reset-password", async (req, res) => {
  const data = req.body || {};
  let db;
  try {
    const token = cleanText(data.token, 200, true);
    const password = cleanPassword(data.password);
    db = getDb();
    db.prepare("DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at <= ?").run(new Date().toISOString());
    const row = db.prepare("SELECT * FROM password_reset_tokens WHERE token = ?").get(token);
    if (!tokenIsValid(row)) {
      db.close();
      const msg = "Ce lien est invalide ou expiré.";
      if (req.is("json")) return res.status(400).json({ error: msg });
      return res.status(400).send(resetPasswordHtml(`<h1>Réinitialisation</h1><p class="error">${msg}</p><a class="link" href="/login.html">Retour</a>`));
    }
    const hash = await bcrypt.hash(password, 12);
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, row.user_id);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(nowIso(), row.id);
    db.close();
    req.session.destroy(() => {
      res.clearCookie("magma_sid");
      if (req.is("json")) return res.json({ success: true, message: "Mot de passe réinitialisé. Connectez-vous avec votre nouveau mot de passe." });
      return res.send(resetPasswordHtml(`<h1>Mot de passe réinitialisé</h1><p class="success">Votre mot de passe a été mis à jour. Votre session a été fermée par sécurité.</p><a class="link" href="/login.html">Se connecter</a>`));
    });
  } catch (e) {
    if (db) db.close();
    if (req.is("json")) return res.status(400).json({ error: e.message || "Réinitialisation impossible." });
    return res.status(400).send(resetPasswordHtml(`<h1>Réinitialisation</h1><p class="error">${escapeHtml(e.message || "Réinitialisation impossible.")}</p><a class="link" href="/login.html">Retour</a>`));
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
