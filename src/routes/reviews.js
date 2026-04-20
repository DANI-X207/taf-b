const express = require("express");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanInt } = require("../helpers");
const { requireUser, getCurrentUser } = require("../middleware");

const router = express.Router();

router.post("/api/reviews", requireUser(), (req, res) => {
  const data = req.body || {};
  let db;
  try {
    const bookId = parseInt(data.book_id, 10);
    const userId = data.user_id ? cleanInt(data.user_id, 1) : null;
    const rating = parseInt(data.rating, 10);
    if (!Number.isInteger(bookId) || bookId < 1) throw new Error("Livre invalide.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("La note doit être comprise entre 1 et 5.");
    const user = getCurrentUser(req);
    if (userId && user && userId !== user.id && !req.session.admin_authenticated) throw new Error("Utilisateur non autorisé pour cet avis.");
    const customerName = cleanText(data.customer_name || (user || {}).name, 120, true);
    const comment = cleanText(data.comment, 800, true);
    db = getDb();
    if (!db.prepare("SELECT id FROM books WHERE id = ?").get(bookId)) {
      db.close();
      return res.status(404).json({ error: "Livre non trouvé" });
    }
    const finalUserId = userId || (user || {}).id || null;
    if (finalUserId && !db.prepare("SELECT id FROM users WHERE id = ?").get(finalUserId)) {
      db.close();
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }
    const result = db.prepare("INSERT INTO reviews (book_id, user_id, customer_name, rating, comment, created_at) VALUES (?,?,?,?,?,?)").run(bookId, finalUserId, customerName, rating, comment, nowIso());
    const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(result.lastInsertRowid);
    db.close();
    return res.status(201).json({ success: true, message: "Avis enregistré", review });
  } catch (e) {
    if (db) db.close();
    return res.status(400).json({ success: false, error: e.message || "Impossible d'enregistrer l'avis." });
  }
});

module.exports = router;
