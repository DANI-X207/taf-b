const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const DB_PATH = path.join(__dirname, "..", "data", "bookstore.db");

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "");

function getDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

function addColumnIfMissing(db, table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => r.name);
  if (!cols.includes(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT DEFAULT '',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titre TEXT NOT NULL,
      auteur TEXT NOT NULL,
      genre TEXT NOT NULL,
      prix INTEGER NOT NULL,
      description TEXT,
      image TEXT,
      stock INTEGER DEFAULT 10,
      featured INTEGER DEFAULT 0,
      infos TEXT DEFAULT '',
      created_at TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      delivery_zone TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'En attente',
      email_status TEXT DEFAULT 'pending',
      tracking_token TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT DEFAULT '',
      cancelled_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      book_id INTEGER,
      titre TEXT NOT NULL,
      auteur TEXT NOT NULL,
      prix INTEGER NOT NULL,
      qty INTEGER NOT NULL,
      image TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      user_id INTEGER,
      customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(book_id) REFERENCES books(id),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  addColumnIfMissing(db, "books", "infos", "TEXT DEFAULT ''");
  addColumnIfMissing(db, "books", "created_at", "TEXT DEFAULT ''");
  addColumnIfMissing(db, "orders", "user_id", "INTEGER REFERENCES users(id)");
  addColumnIfMissing(db, "orders", "tracking_token", "TEXT DEFAULT ''");
  addColumnIfMissing(db, "orders", "updated_at", "TEXT DEFAULT ''");
  addColumnIfMissing(db, "orders", "admin_confirmed", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "orders", "client_confirmed", "INTEGER DEFAULT 0");
  addColumnIfMissing(db, "orders", "validated_at", "TEXT");
  addColumnIfMissing(db, "users", "phone", "TEXT DEFAULT ''");
  addColumnIfMissing(db, "users", "is_active", "INTEGER DEFAULT 1");
  addColumnIfMissing(db, "reviews", "user_id", "INTEGER REFERENCES users(id)");

  const bookCount = db.prepare("SELECT COUNT(*) as c FROM books").get().c;
  if (bookCount === 0) {
    const insert = db.prepare(`
      INSERT INTO books (titre, auteur, genre, prix, description, image, stock, featured, infos, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const seed = db.transaction(() => {
      const books = [
        ["L'Alchimiste", "Paulo Coelho", "Roman", 4500, "Un berger andalou part à la recherche d'un trésor au pied des pyramides d'Égypte.", "https://covers.openlibrary.org/b/id/8739161-L.jpg", 15, 1, "Best-seller international"],
        ["Le Petit Prince", "Antoine de Saint-Exupéry", "Jeunesse", 3500, "Un conte philosophique et poétique sous l'apparence d'un conte pour enfants.", "https://covers.openlibrary.org/b/id/8226191-L.jpg", 20, 1, "Lecture scolaire et familiale"],
        ["Sapiens", "Yuval Noah Harari", "Sciences", 6500, "Une brève histoire de l'humanité, de la préhistoire à nos jours.", "https://covers.openlibrary.org/b/id/8739173-L.jpg", 8, 1, "Essai historique"],
        ["1984", "George Orwell", "Roman", 4000, "Dans un État totalitaire, Big Brother surveille chaque citoyen.", "https://covers.openlibrary.org/b/id/7222246-L.jpg", 12, 0, "Classique dystopique"],
        ["Les Misérables", "Victor Hugo", "Roman", 5500, "L'épopée de Jean Valjean dans la France du XIXe siècle.", "https://covers.openlibrary.org/b/id/2423902-L.jpg", 6, 0, "Grand classique"],
        ["Thinking, Fast and Slow", "Daniel Kahneman", "Développement", 5000, "Deux systèmes de pensée qui guident nos jugements et décisions.", "https://covers.openlibrary.org/b/id/8171393-L.jpg", 9, 1, "Psychologie cognitive"],
        ["Atomic Habits", "James Clear", "Développement", 4800, "Comment construire de bonnes habitudes et en finir avec les mauvaises.", "https://covers.openlibrary.org/b/id/10309902-L.jpg", 14, 0, "Développement personnel"],
        ["Dune", "Frank Herbert", "Science-Fiction", 5200, "Une fresque épique sur la planète désert Arrakis et son précieux épice.", "https://covers.openlibrary.org/b/id/8087474-L.jpg", 7, 0, "Saga culte"],
        ["Le Comte de Monte-Cristo", "Alexandre Dumas", "Roman", 6000, "La vengeance d'Edmond Dantès, injustement emprisonné au château d'If.", "https://covers.openlibrary.org/b/id/8739051-L.jpg", 5, 1, "Aventure et vengeance"],
        ["Harry Potter à l'école des sorciers", "J.K. Rowling", "Jeunesse", 3800, "Un jeune garçon découvre qu'il est un sorcier et entre à Poudlard.", "https://covers.openlibrary.org/b/id/10110415-L.jpg", 18, 0, "Fantaisie jeunesse"],
        ["Homo Deus", "Yuval Noah Harari", "Sciences", 6000, "Une brève histoire de l'avenir de l'humanité.", "https://covers.openlibrary.org/b/id/8739174-L.jpg", 10, 0, "Prospective"],
        ["La Ferme des Animaux", "George Orwell", "Roman", 3200, "Une fable politique sur la corruption du pouvoir.", "https://covers.openlibrary.org/b/id/8233027-L.jpg", 11, 0, "Satire politique"],
      ];
      for (const b of books) insert.run(...b, nowIso());
    });
    seed();
  }

  const adCount = db.prepare("SELECT COUNT(*) as c FROM ads").get().c;
  if (adCount === 0) {
    db.prepare("INSERT INTO ads (title, message, link, active, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "Livraison ciblée",
      "Commandez vos livres dans la zone Potopoto la gare, Saint Exupérie, Présidence, OSH ou CHU.",
      "",
      1,
      nowIso()
    );
  }

  db.exec(`
    UPDATE orders SET status = 'Confirmée' WHERE status IN ('confirmed');
    UPDATE orders SET status = 'Annulée' WHERE status = 'cancelled';
    UPDATE orders SET status = 'En attente' WHERE status NOT IN ('En attente', 'Confirmée', 'En livraison', 'Livrée', 'Annulée', 'Validée');
  `);
  db.prepare("UPDATE orders SET tracking_token = lower(hex(randomblob(16))) WHERE tracking_token IS NULL OR tracking_token = ''").run();
  db.prepare("UPDATE orders SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''").run();

  db.close();
}

module.exports = { getDb, nowIso, initDb };
