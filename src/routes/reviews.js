const express = require("express");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanInt } = require("../helpers");
const { requireUser, getCurrentUser } = require("../middleware");

const router = express.Router();

// === GET reviews for a book (public) =========================================
router.get("/api/books/:id/reviews", async (req, res) => {
  try {
    const bookId = parseInt(req.params.id, 10);
    if (!Number.isInteger(bookId) || bookId < 1) {
      return res.status(400).json({ error: "Identifiant de livre invalide." });
    }
    const db = await getDb();
    const reviews = await db.all(
      "SELECT id, book_id, user_id, customer_name, rating, comment, created_at FROM reviews WHERE book_id = ? ORDER BY id DESC",
      bookId
    );
    res.json(reviews);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// === POST review for a book (logged-in user required) ========================
router.post("/api/books/:id/reviews", requireUser(), async (req, res) => {
  const data = req.body || {};
  try {
    const bookId = parseInt(req.params.id, 10);
    if (!Number.isInteger(bookId) || bookId < 1) {
      return res.status(400).json({ error: "Identifiant de livre invalide." });
    }
    const rating = parseInt(data.rating, 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "La note doit être comprise entre 1 et 5." });
    }
    const comment = cleanText(data.comment, 800, true);
    if (comment.length < 3) {
      return res.status(400).json({ error: "Votre commentaire est trop court." });
    }
    const db = await getDb();
    if (!(await db.get("SELECT id FROM books WHERE id = ?", bookId))) {
      return res.status(404).json({ error: "Livre non trouvé" });
    }
    const user = await getCurrentUser(req);
    const customerName = cleanText(data.customer_name || (user || {}).name || "Anonyme", 120, true);
    const finalUserId = (user || {}).id || null;
    const result = await db.run(
      "INSERT INTO reviews (book_id, user_id, customer_name, rating, comment, created_at) VALUES (?,?,?,?,?,?)",
      bookId, finalUserId, customerName, rating, comment, nowIso()
    );
    const review = await db.get("SELECT * FROM reviews WHERE id = ?", result.lastID);
    return res.status(201).json({ success: true, message: "Avis enregistré", review });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "Impossible d'enregistrer l'avis." });
  }
});

// === Legacy POST /api/reviews (kept for backward compatibility) ==============
router.post("/api/reviews", requireUser(), async (req, res) => {
  const data = req.body || {};
  try {
    const bookId = parseInt(data.book_id, 10);
    const userId = data.user_id ? cleanInt(data.user_id, 1) : null;
    const rating = parseInt(data.rating, 10);
    if (!Number.isInteger(bookId) || bookId < 1) throw new Error("Livre invalide.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error("La note doit être comprise entre 1 et 5.");
    const user = await getCurrentUser(req);
    if (userId && user && userId !== user.id && !req.session.admin_authenticated) throw new Error("Utilisateur non autorisé pour cet avis.");
    const customerName = cleanText(data.customer_name || (user || {}).name, 120, true);
    const comment = cleanText(data.comment, 800, true);
    const db = await getDb();
    if (!(await db.get("SELECT id FROM books WHERE id = ?", bookId))) {
      return res.status(404).json({ error: "Livre non trouvé" });
    }
    const finalUserId = userId || (user || {}).id || null;
    if (finalUserId && !(await db.get("SELECT id FROM users WHERE id = ?", finalUserId))) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }
    const result = await db.run(
      "INSERT INTO reviews (book_id, user_id, customer_name, rating, comment, created_at) VALUES (?,?,?,?,?,?)",
      bookId, finalUserId, customerName, rating, comment, nowIso()
    );
    const review = await db.get("SELECT * FROM reviews WHERE id = ?", result.lastID);
    return res.status(201).json({ success: true, message: "Avis enregistré", review });
  } catch (e) {
    return res.status(400).json({ success: false, error: e.message || "Impossible d'enregistrer l'avis." });
  }
});

module.exports = router;
