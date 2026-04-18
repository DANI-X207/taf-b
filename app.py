import io
import os
import re
import secrets
import smtplib
import sqlite3
from datetime import datetime, timedelta
from email.message import EmailMessage
from html import escape

from flask import Flask, Response, jsonify, request, send_file, send_from_directory, session
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET")
if not app.secret_key:
    app.secret_key = secrets.token_hex(32)
    app.logger.warning("SESSION_SECRET is not set; using a temporary development secret.")

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "bookstore.db")
PUBLIC_HTML = os.path.join(os.path.dirname(__file__), "public", "html")
PUBLIC_CSS = os.path.join(os.path.dirname(__file__), "public", "css")
PUBLIC_IMG = os.path.join(os.path.dirname(__file__), "public", "img")
PUBLIC_JS = os.path.join(os.path.dirname(__file__), "public", "js")

SITE_NAME = "Librairie Magma"
ADMIN_PASSWORD = "TAF1-FLEMME"
ORDER_EMAIL_TO = "moussokiexauce7@gmail.com"
CANCEL_WINDOW_MINUTES = 5
ALLOWED_DELIVERY_ZONES = [
    "Potopoto la gare",
    "Total vers Saint Exupérie",
    "Présidence",
    "OSH",
    "CHU",
]
INJECT_SCRIPT = '<script src="/js/bookstore.js"></script></body>'
HEAD_COMPAT_SCRIPT = """
<script>
window.clWDUtil = new Proxy(window.clWDUtil || {}, {
  get: function (target, prop) {
    if (prop in target) return target[prop];
    if (prop === "pfGetTraitement") {
      return function () { return function () {}; };
    }
    return function () { return function () {}; };
  }
});
window.oGetObjetChamp = window.oGetObjetChamp || function () {
  return {
    OnClick: function () {},
    OnMouseOver: function () {},
    OnMouseOut: function () {}
  };
};
window.WDBandeauDefilant = window.WDBandeauDefilant || function () {
  return {
    Init: function () {},
    Demarre: function () {},
    Arrete: function () {}
  };
};
[
  "WDAnim",
  "WDChamp",
  "WDDrag",
  "WDImage",
  "WDMenu",
  "WDOnglet",
  "WDSaisie",
  "WDTableZRCommun",
  "WDUtil",
  "WDZRNavigateur"
].forEach(function (name) {
  window[name] = window[name] || function () {
    return {
      Init: function () {},
      OnClick: function () {},
      OnMouseOver: function () {},
      OnMouseOut: function () {}
    };
  };
});
window.wbImgHomNav = window.wbImgHomNav || function () {};
</script>
</head>
"""

PAGE_TITLES = {
    "index": SITE_NAME + " — Accueil",
    "login": SITE_NAME + " — Connexion",
    "Mon-panier": SITE_NAME + " — Mon Panier",
    "Ajout-Produit": SITE_NAME + " — Ajouter un Livre",
    "MABOUTIQUE": SITE_NAME + " — Ma Boutique",
    "PI_Produit": SITE_NAME + " — Détail du Livre",
    "Formulaire": SITE_NAME + " — Formulaire",
    "PAGEMOD-Accueil": SITE_NAME,
    "Admin": SITE_NAME + " — Admin",
}


def now_iso():
    return datetime.utcnow().isoformat(timespec="seconds")


def parse_iso(value):
    return datetime.fromisoformat(value)


def clean_text(value, max_len=500, required=False):
    text = str(value or "").strip()
    if required and not text:
        raise ValueError("Champ obligatoire manquant")
    return text[:max_len]


def clean_int(value, min_value=0, default=0):
    try:
        number = int(value)
    except (TypeError, ValueError):
        number = default
    return max(min_value, number)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def table_columns(conn, table_name):
    return [row["name"] for row in conn.execute(f"PRAGMA table_info({table_name})").fetchall()]


def add_column_if_missing(conn, table_name, column_name, definition):
    if column_name not in table_columns(conn, table_name):
        conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = get_db()
    conn.execute("""
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
        )
    """)
    add_column_if_missing(conn, "books", "infos", "TEXT DEFAULT ''")
    add_column_if_missing(conn, "books", "created_at", "TEXT DEFAULT ''")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name TEXT NOT NULL,
            customer_email TEXT NOT NULL,
            customer_phone TEXT NOT NULL,
            delivery_zone TEXT NOT NULL,
            delivery_address TEXT NOT NULL,
            total INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'validated',
            email_status TEXT DEFAULT 'pending',
            created_at TEXT NOT NULL,
            cancelled_at TEXT
        )
    """)
    conn.execute("""
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
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reviews (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER NOT NULL,
            customer_name TEXT NOT NULL,
            rating INTEGER NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(book_id) REFERENCES books(id)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS ads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            link TEXT DEFAULT '',
            active INTEGER DEFAULT 1,
            created_at TEXT NOT NULL
        )
    """)

    if conn.execute("SELECT COUNT(*) FROM books").fetchone()[0] == 0:
        books = [
            ("L'Alchimiste", "Paulo Coelho", "Roman", 4500,
             "Un berger andalou part à la recherche d'un trésor au pied des pyramides d'Égypte.",
             "https://covers.openlibrary.org/b/id/8739161-L.jpg", 15, 1, "Best-seller international"),
            ("Le Petit Prince", "Antoine de Saint-Exupéry", "Jeunesse", 3500,
             "Un conte philosophique et poétique sous l'apparence d'un conte pour enfants.",
             "https://covers.openlibrary.org/b/id/8226191-L.jpg", 20, 1, "Lecture scolaire et familiale"),
            ("Sapiens", "Yuval Noah Harari", "Sciences", 6500,
             "Une brève histoire de l'humanité, de la préhistoire à nos jours.",
             "https://covers.openlibrary.org/b/id/8739173-L.jpg", 8, 1, "Essai historique"),
            ("1984", "George Orwell", "Roman", 4000,
             "Dans un État totalitaire, Big Brother surveille chaque citoyen.",
             "https://covers.openlibrary.org/b/id/7222246-L.jpg", 12, 0, "Classique dystopique"),
            ("Les Misérables", "Victor Hugo", "Roman", 5500,
             "L'épopée de Jean Valjean dans la France du XIXe siècle.",
             "https://covers.openlibrary.org/b/id/2423902-L.jpg", 6, 0, "Grand classique"),
            ("Thinking, Fast and Slow", "Daniel Kahneman", "Développement", 5000,
             "Deux systèmes de pensée qui guident nos jugements et décisions.",
             "https://covers.openlibrary.org/b/id/8171393-L.jpg", 9, 1, "Psychologie cognitive"),
            ("Atomic Habits", "James Clear", "Développement", 4800,
             "Comment construire de bonnes habitudes et en finir avec les mauvaises.",
             "https://covers.openlibrary.org/b/id/10309902-L.jpg", 14, 0, "Développement personnel"),
            ("Dune", "Frank Herbert", "Science-Fiction", 5200,
             "Une fresque épique sur la planète désert Arrakis et son précieux épice.",
             "https://covers.openlibrary.org/b/id/8087474-L.jpg", 7, 0, "Saga culte"),
            ("Le Comte de Monte-Cristo", "Alexandre Dumas", "Roman", 6000,
             "La vengeance d'Edmond Dantès, injustement emprisonné au château d'If.",
             "https://covers.openlibrary.org/b/id/8739051-L.jpg", 5, 1, "Aventure et vengeance"),
            ("Harry Potter à l'école des sorciers", "J.K. Rowling", "Jeunesse", 3800,
             "Un jeune garçon découvre qu'il est un sorcier et entre à Poudlard.",
             "https://covers.openlibrary.org/b/id/10110415-L.jpg", 18, 0, "Fantaisie jeunesse"),
            ("Homo Deus", "Yuval Noah Harari", "Sciences", 6000,
             "Une brève histoire de l'avenir de l'humanité.",
             "https://covers.openlibrary.org/b/id/8739174-L.jpg", 10, 0, "Prospective"),
            ("La Ferme des Animaux", "George Orwell", "Roman", 3200,
             "Une fable politique sur la corruption du pouvoir.",
             "https://covers.openlibrary.org/b/id/8233027-L.jpg", 11, 0, "Satire politique"),
        ]
        conn.executemany(
            """
            INSERT INTO books (titre, auteur, genre, prix, description, image, stock, featured, infos, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
            """,
            [book + (now_iso(),) for book in books]
        )

    if conn.execute("SELECT COUNT(*) FROM ads").fetchone()[0] == 0:
        conn.execute(
            "INSERT INTO ads (title, message, link, active, created_at) VALUES (?,?,?,?,?)",
            ("Livraison ciblée", "Commandez vos livres dans la zone Potopoto la gare, Saint Exupérie, Présidence, OSH ou CHU.", "", 1, now_iso()),
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
    content = re.sub(r"(>)([^<]*)Mayombe([^<]*<)", lambda m: m.group(1) + m.group(2) + SITE_NAME + m.group(3), content)
    if "window.clWDUtil" not in content:
        content = content.replace("</head>", HEAD_COMPAT_SCRIPT, 1)
    if "/js/bookstore.js" not in content:
        content = content.replace("</body>", INJECT_SCRIPT, 1)
    return Response(content, mimetype="text/html")


def require_admin():
    return bool(session.get("admin_authenticated"))


def admin_required_response():
    return jsonify({"error": "Accès administrateur requis."}), 401


def row_to_book(row):
    book = dict(row)
    book["prix"] = int(book.get("prix") or 0)
    book["stock"] = int(book.get("stock") or 0)
    book["featured"] = int(book.get("featured") or 0)
    return book


def current_cart():
    return session.get("cart", [])


def save_cart(cart):
    session["cart"] = cart
    session.modified = True


def send_order_email(order, items):
    smtp_host = os.environ.get("SMTP_HOST")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER")
    smtp_password = os.environ.get("SMTP_PASSWORD")
    smtp_from = os.environ.get("SMTP_FROM", smtp_user or "no-reply@librairie-magma.local")

    lines = [
        f"Nouvelle commande #{order['id']}",
        f"Client : {order['customer_name']}",
        f"Email : {order['customer_email']}",
        f"Téléphone : {order['customer_phone']}",
        f"Zone : {order['delivery_zone']}",
        f"Adresse : {order['delivery_address']}",
        "",
        "Produits :",
    ]
    for item in items:
        lines.append(f"- {item['titre']} ({item['auteur']}) x{item['qty']} : {item['prix'] * item['qty']} FCFA")
    lines.append("")
    lines.append(f"Total : {order['total']} FCFA")

    if not smtp_host:
        app.logger.warning("SMTP_HOST is not configured; order email was not sent.")
        return "smtp_not_configured"

    message = EmailMessage()
    message["Subject"] = f"Commande Librairie Magma #{order['id']}"
    message["From"] = smtp_from
    message["To"] = ORDER_EMAIL_TO
    message.set_content("\n".join(lines))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if smtp_user and smtp_password:
                smtp.login(smtp_user, smtp_password)
            smtp.send_message(message)
        return "sent"
    except Exception as exc:
        app.logger.exception("Unable to send order email: %s", exc)
        return "failed"


def generate_receipt_pdf(order, items):
    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=A4, title=f"Reçu commande {order['id']}")
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Librairie Magma", styles["Title"]),
        Paragraph(f"Reçu de commande #{order['id']}", styles["Heading2"]),
        Paragraph(f"Date : {order['created_at']}", styles["Normal"]),
        Spacer(1, 12),
        Paragraph("Client", styles["Heading3"]),
        Paragraph(escape(order["customer_name"]), styles["Normal"]),
        Paragraph(escape(order["customer_email"]), styles["Normal"]),
        Paragraph(escape(order["customer_phone"]), styles["Normal"]),
        Paragraph(f"Livraison : {escape(order['delivery_zone'])} — {escape(order['delivery_address'])}", styles["Normal"]),
        Spacer(1, 12),
    ]
    rows = [["Livre", "Auteur", "Qté", "Prix", "Sous-total"]]
    for item in items:
        rows.append([item["titre"], item["auteur"], str(item["qty"]), f"{item['prix']} FCFA", f"{item['prix'] * item['qty']} FCFA"])
    rows.append(["", "", "", "Total", f"{order['total']} FCFA"])
    table = Table(rows, colWidths=[150, 120, 40, 80, 90])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2b293a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dddddd")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fff2e8")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ]))
    story.append(table)
    story.append(Spacer(1, 12))
    story.append(Paragraph("Annulation possible uniquement dans les 5 minutes suivant la validation.", styles["Italic"]))
    document.build(story)
    buffer.seek(0)
    return buffer


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
    if filename.endswith(".js"):
        return Response("", mimetype="application/javascript")
    return Response("", status=404)


@app.route("/<path:filename>")
def static_file(filename):
    for base in [PUBLIC_HTML, PUBLIC_CSS, PUBLIC_IMG, PUBLIC_JS]:
        fullpath = os.path.join(base, filename)
        if os.path.exists(fullpath):
            return send_from_directory(base, filename)
    return Response("Fichier non trouvé", status=404)


@app.route("/api/books", methods=["GET"])
def get_books():
    genre = clean_text(request.args.get("genre", ""), 80)
    search = clean_text(request.args.get("search", ""), 120)
    conn = get_db()
    query = "SELECT * FROM books WHERE 1=1"
    params = []
    if genre:
        query += " AND genre = ?"
        params.append(genre)
    if search:
        query += " AND (titre LIKE ? OR auteur LIKE ? OR genre LIKE ? OR description LIKE ?)"
        s = f"%{search}%"
        params.extend([s, s, s, s])
    query += " ORDER BY featured DESC, id DESC"
    books = [row_to_book(row) for row in conn.execute(query, params).fetchall()]
    conn.close()
    return jsonify(books)


@app.route("/api/books/featured", methods=["GET"])
def get_featured():
    conn = get_db()
    books = [row_to_book(row) for row in conn.execute("SELECT * FROM books WHERE featured = 1 ORDER BY id DESC").fetchall()]
    conn.close()
    return jsonify(books)


@app.route("/api/books/<int:book_id>", methods=["GET"])
def get_book(book_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Livre non trouvé"}), 404
    return jsonify(row_to_book(row))


@app.route("/api/books", methods=["POST"])
def add_book():
    if not require_admin():
        return admin_required_response()
    data = request.get_json(silent=True) or {}
    try:
        titre = clean_text(data.get("titre"), 160, True)
        auteur = clean_text(data.get("auteur"), 160, True)
        genre = clean_text(data.get("genre"), 80, True)
        prix = clean_int(data.get("prix"), 1)
        if prix <= 0:
            raise ValueError("Prix invalide")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = get_db()
    conn.execute(
        """
        INSERT INTO books (titre, auteur, genre, prix, description, image, stock, featured, infos, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)
        """,
        (
            titre,
            auteur,
            genre,
            prix,
            clean_text(data.get("description"), 1200),
            clean_text(data.get("image"), 700),
            clean_int(data.get("stock"), 0, 10),
            1 if data.get("featured") else 0,
            clean_text(data.get("infos"), 1000),
            now_iso(),
        ),
    )
    conn.commit()
    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    book = row_to_book(conn.execute("SELECT * FROM books WHERE id = ?", (new_id,)).fetchone())
    conn.close()
    return jsonify(book), 201


@app.route("/api/books/<int:book_id>", methods=["PUT"])
def update_book(book_id):
    if not require_admin():
        return admin_required_response()
    data = request.get_json(silent=True) or {}
    try:
        titre = clean_text(data.get("titre"), 160, True)
        auteur = clean_text(data.get("auteur"), 160, True)
        genre = clean_text(data.get("genre"), 80, True)
        prix = clean_int(data.get("prix"), 1)
        if prix <= 0:
            raise ValueError("Prix invalide")
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    conn = get_db()
    result = conn.execute(
        """
        UPDATE books
        SET titre = ?, auteur = ?, genre = ?, prix = ?, description = ?, image = ?, stock = ?, featured = ?, infos = ?
        WHERE id = ?
        """,
        (
            titre,
            auteur,
            genre,
            prix,
            clean_text(data.get("description"), 1200),
            clean_text(data.get("image"), 700),
            clean_int(data.get("stock"), 0, 10),
            1 if data.get("featured") else 0,
            clean_text(data.get("infos"), 1000),
            book_id,
        ),
    )
    conn.commit()
    if result.rowcount == 0:
        conn.close()
        return jsonify({"error": "Livre non trouvé"}), 404
    book = row_to_book(conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone())
    conn.close()
    return jsonify(book)


@app.route("/api/books/<int:book_id>", methods=["DELETE"])
def delete_book(book_id):
    if not require_admin():
        return admin_required_response()
    conn = get_db()
    conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


@app.route("/api/cart", methods=["GET"])
def get_cart():
    return jsonify(current_cart())


@app.route("/api/cart/add", methods=["POST"])
def add_to_cart():
    data = request.get_json(silent=True) or {}
    book_id = clean_int(data.get("id"), 1)
    qty = clean_int(data.get("qty"), 1, 1)
    conn = get_db()
    row = conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()
    conn.close()
    if row is None:
        return jsonify({"error": "Livre non trouvé"}), 404
    book = row_to_book(row)
    if book["stock"] <= 0:
        return jsonify({"error": "Livre indisponible"}), 400
    cart = current_cart()
    for item in cart:
        if item["id"] == book_id:
            item["qty"] = min(item["qty"] + qty, book["stock"])
            save_cart(cart)
            return jsonify({"success": True, "cart": cart})
    cart.append({"id": book_id, "titre": book["titre"], "auteur": book["auteur"], "prix": book["prix"], "image": book["image"], "qty": min(qty, book["stock"])})
    save_cart(cart)
    return jsonify({"success": True, "cart": cart})


@app.route("/api/cart/remove/<int:book_id>", methods=["DELETE"])
def remove_from_cart(book_id):
    cart = [item for item in current_cart() if item["id"] != book_id]
    save_cart(cart)
    return jsonify({"success": True, "cart": cart})


@app.route("/api/cart/clear", methods=["DELETE"])
def clear_cart():
    save_cart([])
    return jsonify({"success": True})


@app.route("/api/genres", methods=["GET"])
def get_genres():
    conn = get_db()
    genres = [row[0] for row in conn.execute("SELECT DISTINCT genre FROM books ORDER BY genre").fetchall()]
    conn.close()
    return jsonify(genres)


@app.route("/api/delivery-zones", methods=["GET"])
def get_delivery_zones():
    return jsonify(ALLOWED_DELIVERY_ZONES)


@app.route("/api/orders", methods=["POST"])
def create_order():
    cart = current_cart()
    if not cart:
        return jsonify({"error": "Votre panier est vide."}), 400
    data = request.get_json(silent=True) or {}
    try:
        customer_name = clean_text(data.get("customer_name"), 140, True)
        customer_email = clean_text(data.get("customer_email"), 180, True)
        customer_phone = clean_text(data.get("customer_phone"), 40, True)
        delivery_zone = clean_text(data.get("delivery_zone"), 120, True)
        delivery_address = clean_text(data.get("delivery_address"), 260, True)
    except ValueError:
        return jsonify({"error": "Merci de remplir toutes les informations client."}), 400

    if delivery_zone not in ALLOWED_DELIVERY_ZONES:
        return jsonify({"error": "Livraison impossible : cette adresse est hors zone. Zones autorisées : Potopoto la gare, Total vers Saint Exupérie, Présidence, OSH, CHU."}), 400

    conn = get_db()
    valid_items = []
    total = 0
    for item in cart:
        row = conn.execute("SELECT * FROM books WHERE id = ?", (item["id"],)).fetchone()
        if not row:
            conn.close()
            return jsonify({"error": f"Le livre {item['titre']} n'est plus disponible."}), 400
        book = row_to_book(row)
        qty = min(clean_int(item.get("qty"), 1, 1), book["stock"])
        if qty <= 0:
            conn.close()
            return jsonify({"error": f"Le livre {book['titre']} est en rupture de stock."}), 400
        valid_items.append({"book_id": book["id"], "titre": book["titre"], "auteur": book["auteur"], "prix": book["prix"], "qty": qty, "image": book["image"]})
        total += book["prix"] * qty

    created_at = now_iso()
    conn.execute(
        """
        INSERT INTO orders (customer_name, customer_email, customer_phone, delivery_zone, delivery_address, total, status, email_status, created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        """,
        (customer_name, customer_email, customer_phone, delivery_zone, delivery_address, total, "validated", "pending", created_at),
    )
    order_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    for item in valid_items:
        conn.execute(
            "INSERT INTO order_items (order_id, book_id, titre, auteur, prix, qty, image) VALUES (?,?,?,?,?,?,?)",
            (order_id, item["book_id"], item["titre"], item["auteur"], item["prix"], item["qty"], item["image"]),
        )
        conn.execute("UPDATE books SET stock = MAX(stock - ?, 0) WHERE id = ?", (item["qty"], item["book_id"]))
    conn.commit()
    order = dict(conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone())
    email_status = send_order_email(order, valid_items)
    conn.execute("UPDATE orders SET email_status = ? WHERE id = ?", (email_status, order_id))
    conn.commit()
    order = dict(conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone())
    conn.close()
    save_cart([])
    return jsonify({"success": True, "order": order, "receipt_url": f"/api/orders/{order_id}/receipt.pdf", "cancel_until": (parse_iso(created_at) + timedelta(minutes=CANCEL_WINDOW_MINUTES)).isoformat(timespec="seconds")}), 201


@app.route("/api/orders/<int:order_id>", methods=["GET"])
def get_order(order_id):
    conn = get_db()
    order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Commande non trouvée"}), 404
    items = [dict(row) for row in conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()]
    conn.close()
    order_data = dict(order)
    order_data["items"] = items
    order_data["can_cancel"] = order_data["status"] == "validated" and datetime.utcnow() <= parse_iso(order_data["created_at"]) + timedelta(minutes=CANCEL_WINDOW_MINUTES)
    return jsonify(order_data)


@app.route("/api/orders/<int:order_id>/cancel", methods=["POST"])
def cancel_order(order_id):
    conn = get_db()
    order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Commande non trouvée"}), 404
    order_data = dict(order)
    if order_data["status"] == "cancelled":
        conn.close()
        return jsonify({"error": "Cette commande est déjà annulée."}), 400
    if datetime.utcnow() > parse_iso(order_data["created_at"]) + timedelta(minutes=CANCEL_WINDOW_MINUTES):
        conn.close()
        return jsonify({"error": "Le délai d'annulation de 5 minutes est dépassé."}), 400
    items = conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()
    for item in items:
        if item["book_id"]:
            conn.execute("UPDATE books SET stock = stock + ? WHERE id = ?", (item["qty"], item["book_id"]))
    conn.execute("UPDATE orders SET status = ?, cancelled_at = ? WHERE id = ?", ("cancelled", now_iso(), order_id))
    conn.commit()
    conn.close()
    return jsonify({"success": True, "status": "cancelled"})


@app.route("/api/orders/<int:order_id>/receipt.pdf", methods=["GET"])
def download_receipt(order_id):
    conn = get_db()
    order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    if not order:
        conn.close()
        return jsonify({"error": "Commande non trouvée"}), 404
    items = [dict(row) for row in conn.execute("SELECT * FROM order_items WHERE order_id = ?", (order_id,)).fetchall()]
    conn.close()
    pdf = generate_receipt_pdf(dict(order), items)
    return send_file(pdf, mimetype="application/pdf", as_attachment=True, download_name=f"recu-commande-{order_id}.pdf")


@app.route("/api/reviews", methods=["POST"])
def add_review():
    data = request.get_json(silent=True) or {}
    book_id = clean_int(data.get("book_id"), 1)
    rating = min(clean_int(data.get("rating"), 1, 5), 5)
    try:
        customer_name = clean_text(data.get("customer_name"), 120, True)
        comment = clean_text(data.get("comment"), 800, True)
    except ValueError:
        return jsonify({"error": "Nom et commentaire obligatoires."}), 400
    conn = get_db()
    if not conn.execute("SELECT id FROM books WHERE id = ?", (book_id,)).fetchone():
        conn.close()
        return jsonify({"error": "Livre non trouvé"}), 404
    conn.execute("INSERT INTO reviews (book_id, customer_name, rating, comment, created_at) VALUES (?,?,?,?,?)", (book_id, customer_name, rating, comment, now_iso()))
    conn.commit()
    review = dict(conn.execute("SELECT * FROM reviews WHERE id = last_insert_rowid()").fetchone())
    conn.close()
    return jsonify(review), 201


@app.route("/api/books/<int:book_id>/reviews", methods=["GET"])
def get_reviews(book_id):
    conn = get_db()
    reviews = [dict(row) for row in conn.execute("SELECT * FROM reviews WHERE book_id = ? ORDER BY id DESC", (book_id,)).fetchall()]
    conn.close()
    return jsonify(reviews)


@app.route("/api/ads", methods=["GET"])
def get_ads():
    conn = get_db()
    ads = [dict(row) for row in conn.execute("SELECT * FROM ads WHERE active = 1 ORDER BY id DESC").fetchall()]
    conn.close()
    return jsonify(ads)


@app.route("/api/admin/status", methods=["GET"])
def admin_status():
    return jsonify({"authenticated": require_admin()})


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    data = request.get_json(silent=True) or {}
    if data.get("password") == ADMIN_PASSWORD:
        session["admin_authenticated"] = True
        return jsonify({"success": True})
    return jsonify({"error": "Mot de passe administrateur incorrect."}), 401


@app.route("/api/admin/logout", methods=["POST"])
def admin_logout():
    session.pop("admin_authenticated", None)
    return jsonify({"success": True})


@app.route("/api/admin/ads", methods=["GET"])
def admin_get_ads():
    if not require_admin():
        return admin_required_response()
    conn = get_db()
    ads = [dict(row) for row in conn.execute("SELECT * FROM ads ORDER BY id DESC").fetchall()]
    conn.close()
    return jsonify(ads)


@app.route("/api/admin/ads", methods=["POST"])
def admin_add_ad():
    if not require_admin():
        return admin_required_response()
    data = request.get_json(silent=True) or {}
    try:
        title = clean_text(data.get("title"), 160, True)
        message = clean_text(data.get("message"), 500, True)
    except ValueError:
        return jsonify({"error": "Titre et message obligatoires."}), 400
    conn = get_db()
    conn.execute("INSERT INTO ads (title, message, link, active, created_at) VALUES (?,?,?,?,?)", (title, message, clean_text(data.get("link"), 500), 1 if data.get("active", True) else 0, now_iso()))
    conn.commit()
    ad = dict(conn.execute("SELECT * FROM ads WHERE id = last_insert_rowid()").fetchone())
    conn.close()
    return jsonify(ad), 201


@app.route("/api/admin/ads/<int:ad_id>", methods=["DELETE"])
def admin_delete_ad(ad_id):
    if not require_admin():
        return admin_required_response()
    conn = get_db()
    conn.execute("DELETE FROM ads WHERE id = ?", (ad_id,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
