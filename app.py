import os
import re
import json
import sqlite3
from flask import Flask, jsonify, request, session, send_from_directory, Response

app = Flask(__name__)
app.secret_key = "mayombe-librairie-secret-2026"

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bookstore.db")
PUBLIC_HTML = os.path.join(os.path.dirname(__file__), "public", "html")
PUBLIC_CSS = os.path.join(os.path.dirname(__file__), "public", "css")
PUBLIC_IMG = os.path.join(os.path.dirname(__file__), "public", "img")
PUBLIC_JS = os.path.join(os.path.dirname(__file__), "public", "js")

INJECT_SCRIPT = '<script src="/js/bookstore.js"></script></body>'

SITE_NAME = "Librairie Magma"

PAGE_TITLES = {
    "index":          SITE_NAME + " — Accueil",
    "login":          SITE_NAME + " — Connexion",
    "Mon-panier":     SITE_NAME + " — Mon Panier",
    "Ajout-Produit":  SITE_NAME + " — Ajouter un Livre",
    "MABOUTIQUE":     SITE_NAME + " — Ma Boutique",
    "PI_Produit":     SITE_NAME + " — Détail du Livre",
    "Formulaire":     SITE_NAME + " — Formulaire",
    "PAGEMOD-Accueil":SITE_NAME,
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titre TEXT NOT NULL,
            auteur TEXT NOT NULL,
            genre TEXT NOT NULL,
            prix INTEGER NOT NULL,
            description TEXT,
            image TEXT,
            stock INTEGER DEFAULT 10,
            featured INTEGER DEFAULT 0
        )
    """)
    c.execute("SELECT COUNT(*) FROM books")
    if c.fetchone()[0] == 0:
        books = [
            ("L'Alchimiste", "Paulo Coelho", "Roman", 4500,
             "Un berger andalou part à la recherche d'un trésor au pied des pyramides d'Égypte.",
             "https://covers.openlibrary.org/b/id/8739161-L.jpg", 15, 1),
            ("Le Petit Prince", "Antoine de Saint-Exupéry", "Jeunesse", 3500,
             "Un conte philosophique et poétique sous l'apparence d'un conte pour enfants.",
             "https://covers.openlibrary.org/b/id/8226191-L.jpg", 20, 1),
            ("Sapiens", "Yuval Noah Harari", "Sciences", 6500,
             "Une brève histoire de l'humanité, de la préhistoire à nos jours.",
             "https://covers.openlibrary.org/b/id/8739173-L.jpg", 8, 1),
            ("1984", "George Orwell", "Roman", 4000,
             "Dans un État totalitaire, Big Brother surveille chaque citoyen.",
             "https://covers.openlibrary.org/b/id/7222246-L.jpg", 12, 0),
            ("Les Misérables", "Victor Hugo", "Roman", 5500,
             "L'épopée de Jean Valjean dans la France du XIXe siècle.",
             "https://covers.openlibrary.org/b/id/2423902-L.jpg", 6, 0),
            ("Thinking, Fast and Slow", "Daniel Kahneman", "Développement", 5000,
             "Deux systèmes de pensée qui guident nos jugements et décisions.",
             "https://covers.openlibrary.org/b/id/8171393-L.jpg", 9, 1),
            ("Atomic Habits", "James Clear", "Développement", 4800,
             "Comment construire de bonnes habitudes et en finir avec les mauvaises.",
             "https://covers.openlibrary.org/b/id/10309902-L.jpg", 14, 0),
            ("Dune", "Frank Herbert", "Science-Fiction", 5200,
             "Une fresque épique sur la planète désert Arrakis et son précieux épice.",
             "https://covers.openlibrary.org/b/id/8087474-L.jpg", 7, 0),
            ("Le Comte de Monte-Cristo", "Alexandre Dumas", "Roman", 6000,
             "La vengeance d'Edmond Dantès, injustement emprisonné au château d'If.",
             "https://covers.openlibrary.org/b/id/8739051-L.jpg", 5, 1),
            ("Harry Potter à l'école des sorciers", "J.K. Rowling", "Jeunesse", 3800,
             "Un jeune garçon découvre qu'il est un sorcier et entre à Poudlard.",
             "https://covers.openlibrary.org/b/id/10110415-L.jpg", 18, 0),
            ("Homo Deus", "Yuval Noah Harari", "Sciences", 6000,
             "Une brève histoire de l'avenir de l'humanité.",
             "https://covers.openlibrary.org/b/id/8739174-L.jpg", 10, 0),
            ("La Ferme des Animaux", "George Orwell", "Roman", 3200,
             "Une fable politique sur la corruption du pouvoir.",
             "https://covers.openlibrary.org/b/id/8233027-L.jpg", 11, 0),
        ]
        c.executemany(
            "INSERT INTO books (titre, auteur, genre, prix, description, image, stock, featured) VALUES (?,?,?,?,?,?,?,?)",
            books
        )
    conn.commit()
    conn.close()


def serve_html(filename):
    filepath = os.path.join(PUBLIC_HTML, filename)
    if not os.path.exists(filepath):
        return Response("Page non trouvée", status=404)
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    page_key = filename.replace(".html", "")
    new_title = PAGE_TITLES.get(page_key, SITE_NAME)
    content = re.sub(r"<title>[^<]*</title>", f"<title>{new_title}</title>", content, count=1)

    content = re.sub(
        r"(>)([^<]*)Mayombe([^<]*<)",
        lambda m: m.group(1) + m.group(2) + SITE_NAME + m.group(3),
        content
    )

    content = content.replace("</body>", INJECT_SCRIPT, 1)
    return Response(content, mimetype="text/html")


@app.route("/")
def index():
    return serve_html("index.html")


@app.route("/<path:filename>.html")
def html_page(filename):
    return serve_html(filename + ".html")


@app.route("/<filename>.css")
def css_file(filename):
    return send_from_directory(PUBLIC_CSS, filename + ".css")


@app.route("/ext/<path:filename>")
def ext_file(filename):
    return send_from_directory(PUBLIC_IMG, filename)


@app.route("/img/<path:filename>")
def img_file(filename):
    return send_from_directory(PUBLIC_IMG, filename)


@app.route("/js/<path:filename>")
def js_file(filename):
    return send_from_directory(PUBLIC_JS, filename)


@app.route("/res/<path:filename>")
def res_file(filename):
    res_dir = os.path.join(PUBLIC_HTML, "res")
    if os.path.exists(os.path.join(res_dir, filename)):
        return send_from_directory(res_dir, filename)
    return Response("", status=404)


@app.route("/<path:filename>")
def static_file(filename):
    for base in [PUBLIC_HTML, PUBLIC_CSS, PUBLIC_IMG, PUBLIC_JS]:
        fullpath = os.path.join(base, filename)
        if os.path.exists(fullpath):
            return send_from_directory(base, filename)
    return Response("Fichier non trouvé", status=404)


# ───── API LIVRES ─────────────────────────────────────────────────────────────

@app.route("/api/books", methods=["GET"])
def get_books():
    genre = request.args.get("genre", "")
    search = request.args.get("search", "")
    conn = get_db()
    query = "SELECT * FROM books WHERE 1=1"
    params = []
    if genre:
        query += " AND genre = ?"
        params.append(genre)
    if search:
        query += " AND (titre LIKE ? OR auteur LIKE ? OR genre LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s])
    query += " ORDER BY featured DESC, id ASC"
    books = [dict(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    return jsonify(books)


@app.route("/api/books/featured", methods=["GET"])
def get_featured():
    conn = get_db()
    books = [dict(row) for row in conn.execute(
        "SELECT * FROM books WHERE featured = 1 ORDER BY id ASC"
    ).fetchall()]
    conn.close()
    return jsonify(books)


@app.route("/api/books/<int:book_id>", methods=["GET"])
def get_book(book_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Livre non trouvé"}), 404
    return jsonify(dict(row))


@app.route("/api/books", methods=["POST"])
def add_book():
    data = request.get_json()
    required = ["titre", "auteur", "genre", "prix"]
    for field in required:
        if not data.get(field):
            return jsonify({"error": f"Champ requis: {field}"}), 400
    conn = get_db()
    conn.execute(
        "INSERT INTO books (titre, auteur, genre, prix, description, image, stock) VALUES (?,?,?,?,?,?,?)",
        (data["titre"], data["auteur"], data.get("genre", "Roman"),
         int(data["prix"]), data.get("description", ""), data.get("image", ""), int(data.get("stock", 10)))
    )
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    book = dict(conn.execute("SELECT * FROM books WHERE id=?", (new_id,)).fetchone())
    conn.close()
    return jsonify(book), 201


@app.route("/api/books/<int:book_id>", methods=["DELETE"])
def delete_book(book_id):
    conn = get_db()
    conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ───── API PANIER (session) ────────────────────────────────────────────────────

@app.route("/api/cart", methods=["GET"])
def get_cart():
    cart = session.get("cart", [])
    return jsonify(cart)


@app.route("/api/cart/add", methods=["POST"])
def add_to_cart():
    data = request.get_json()
    book_id = int(data.get("id", 0))
    qty = int(data.get("qty", 1))
    conn = get_db()
    row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Livre non trouvé"}), 404
    book = dict(row)
    cart = session.get("cart", [])
    for item in cart:
        if item["id"] == book_id:
            item["qty"] += qty
            session["cart"] = cart
            return jsonify({"success": True, "cart": cart})
    cart.append({"id": book_id, "titre": book["titre"], "auteur": book["auteur"],
                 "prix": book["prix"], "image": book["image"], "qty": qty})
    session["cart"] = cart
    return jsonify({"success": True, "cart": cart})


@app.route("/api/cart/remove/<int:book_id>", methods=["DELETE"])
def remove_from_cart(book_id):
    cart = session.get("cart", [])
    cart = [item for item in cart if item["id"] != book_id]
    session["cart"] = cart
    return jsonify({"success": True, "cart": cart})


@app.route("/api/cart/clear", methods=["DELETE"])
def clear_cart():
    session["cart"] = []
    return jsonify({"success": True})


@app.route("/api/genres", methods=["GET"])
def get_genres():
    conn = get_db()
    genres = [row[0] for row in conn.execute(
        "SELECT DISTINCT genre FROM books ORDER BY genre"
    ).fetchall()]
    conn.close()
    return jsonify(genres)


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=False)
