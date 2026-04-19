const express = require("express");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanInt, cleanUrl, rowToBook } = require("../helpers");
const { requireUser, requireAdmin } = require("../middleware");

const router = express.Router();

router.get("/api/books", requireUser(), (req, res) => {
  const genre = cleanText(req.query.genre || "", 80);
  const search = cleanText(req.query.search || "", 120);
  const db = getDb();
  let query = "SELECT * FROM books WHERE 1=1";
  const params = [];
  if (genre) { query += " AND genre = ?"; params.push(genre); }
  if (search) {
    query += " AND (titre LIKE ? OR auteur LIKE ? OR genre LIKE ? OR description LIKE ?)";
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  query += " ORDER BY featured DESC, id DESC";
  const books = db.prepare(query).all(...params).map(rowToBook);
  db.close();
  res.json(books);
});

router.get("/api/books/featured", requireUser(), (req, res) => {
  const db = getDb();
  const books = db.prepare("SELECT * FROM books WHERE featured = 1 ORDER BY id DESC").all().map(rowToBook);
  db.close();
  res.json(books);
});

router.get("/api/books/:id", requireUser(), (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT * FROM books WHERE id = ?").get(parseInt(req.params.id));
  db.close();
  if (!row) return res.status(404).json({ error: "Livre non trouvé" });
  res.json(rowToBook(row));
});

router.post("/api/books", requireAdmin(), (req, res) => {
  const data = req.body || {};
  try {
    const titre = cleanText(data.titre, 160, true);
    const auteur = cleanText(data.auteur, 160, true);
    const genre = cleanText(data.genre, 80, true);
    const prix = cleanInt(data.prix, 1);
    if (prix <= 0) throw new Error("Prix invalide");
    const image = cleanUrl(data.image, 700);
    const db = getDb();
    const result = db.prepare(
      "INSERT INTO books (titre, auteur, genre, prix, description, image, stock, featured, infos, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)"
    ).run(titre, auteur, genre, prix, cleanText(data.description, 1200), image, cleanInt(data.stock, 0, 10), data.featured ? 1 : 0, cleanText(data.infos, 1000), nowIso());
    const book = rowToBook(db.prepare("SELECT * FROM books WHERE id = ?").get(result.lastInsertRowid));
    db.close();
    return res.status(201).json(book);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.put("/api/books/:id", requireAdmin(), (req, res) => {
  const data = req.body || {};
  try {
    const titre = cleanText(data.titre, 160, true);
    const auteur = cleanText(data.auteur, 160, true);
    const genre = cleanText(data.genre, 80, true);
    const prix = cleanInt(data.prix, 1);
    if (prix <= 0) throw new Error("Prix invalide");
    const image = cleanUrl(data.image, 700);
    const db = getDb();
    const result = db.prepare(
      "UPDATE books SET titre=?, auteur=?, genre=?, prix=?, description=?, image=?, stock=?, featured=?, infos=? WHERE id=?"
    ).run(titre, auteur, genre, prix, cleanText(data.description, 1200), image, cleanInt(data.stock, 0, 10), data.featured ? 1 : 0, cleanText(data.infos, 1000), parseInt(req.params.id));
    if (result.changes === 0) { db.close(); return res.status(404).json({ error: "Livre non trouvé" }); }
    const book = rowToBook(db.prepare("SELECT * FROM books WHERE id = ?").get(parseInt(req.params.id)));
    db.close();
    return res.json(book);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.delete("/api/books/:id", requireAdmin(), (req, res) => {
  const db = getDb();
  db.prepare("DELETE FROM books WHERE id = ?").run(parseInt(req.params.id));
  db.close();
  res.json({ success: true });
});

router.get("/api/genres", requireUser(), (req, res) => {
  const db = getDb();
  const genres = db.prepare("SELECT DISTINCT genre FROM books ORDER BY genre").all().map((r) => r.genre);
  db.close();
  res.json(genres);
});

router.get("/api/books/:id/reviews", requireUser(), (req, res) => {
  const db = getDb();
  const reviews = db.prepare("SELECT * FROM reviews WHERE book_id = ? ORDER BY id DESC").all(parseInt(req.params.id));
  db.close();
  res.json(reviews);
});

module.exports = router;
