const { getDb } = require("./db");

function requireAdmin() {
  return (req, res, next) => {
    if (!req.session.admin_authenticated)
      return res.status(401).json({ error: "Accès administrateur requis." });
    next();
  };
}

function requireUser() {
  return (req, res, next) => {
    if (!req.session.user_id && !req.session.admin_authenticated)
      return res.status(401).json({ error: "Connectez-vous ou créez un compte avant d'accéder au catalogue." });
    next();
  };
}

async function getCurrentUser(req) {
  const userId = req.session.user_id;
  if (!userId) return null;
  const db = await getDb();
  const row = await db.get("SELECT * FROM users WHERE id = ?", userId);
  if (!row) {
    delete req.session.user_id;
    return null;
  }
  if (row.is_active === 0) {
    delete req.session.user_id;
    return null;
  }
  const { password_hash, ...user } = row;
  return user;
}

function isAuthenticated(req) {
  return !!(req.session.user_id || req.session.admin_authenticated);
}

module.exports = { requireAdmin, requireUser, getCurrentUser, isAuthenticated };
