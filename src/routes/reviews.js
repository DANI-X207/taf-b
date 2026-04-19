const express = require("express");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanInt } = require("../helpers");
const { requireUser, getCurrentUser } = require("../middleware");

const router = express.Router();

router.post("/api/reviews", requireUser(), (req, res) => {
  const data = req.body || {};
  const bookId = cleanInt(data.book_id, 1);
  const rating = Math.min(cleanInt(data.rating, 1, 5), 5);
  const user = getCurrentUser(req);
  try {
    const customerName = cleanText(data.customer_name || (user || {}).name, 120, true);
    const comment = cleanText(data.comment, 800, true);
    const db = getDb();
    if (!db.prepare("SELECT id FROM books WHERE id = ?").get(bookId)) {
      db.close();
      return res.status(404).json({ error: "Livre non trouvé" });
    }
    db.prepare("INSERT INTO reviews (book_id, user_id, customer_name, rating, comment, created_at) VALUES (?,?,?,?,?,?)").run(bookId, (user || {}).id || null, customerName, rating, comment, nowIso());
    const review = db.prepare("SELECT * FROM reviews WHERE id = last_insert_rowid()").get();
    db.close();
    return res.status(201).json(review);
  } catch (e) {
    return res.status(400).json({ error: "Nom et commentaire obligatoires." });
  }
});

module.exports = router;
