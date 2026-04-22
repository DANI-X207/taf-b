const express = require("express");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const PDFDocument = require("pdfkit");
const { getDb, nowIso } = require("../db");
const { cleanText, cleanInt, cleanEmail, cleanPhone, rowToBook } = require("../helpers");
const { requireUser, getCurrentUser, isAuthenticated } = require("../middleware");

const router = express.Router();

const CANCEL_WINDOW_MINUTES = 5;
const ORDER_STATUSES = ["En attente", "Confirmée", "En livraison", "Livrée", "Reçue", "Annulée"];
const ALLOWED_DELIVERY_ZONES = ["Potopoto la gare", "Total vers Saint Exupérie", "Présidence", "OSH", "CHU"];

function rowToOrder(row, items = []) {
  const order = { ...row };
  order.items = items;
  const created = new Date(row.created_at + "Z");
  const deadline = new Date(created.getTime() + CANCEL_WINDOW_MINUTES * 60 * 1000);
  order.can_cancel = ["En attente", "Confirmée"].includes(row.status) && new Date() <= deadline;
  order.tracking_steps = ORDER_STATUSES.slice(0, -1);
  return order;
}

function userCanAccessOrder(req, order) {
  if (req.session.admin_authenticated) return true;
  const user = getCurrentUser(req);
  const token = req.query.token || req.body.token;
  if (token && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(order.tracking_token || ""))) return true;
  return !!(user && order.user_id && parseInt(order.user_id) === parseInt(user.id));
}

async function sendOrderEmail(order, items) {
  const host = process.env.SMTP_HOST;
  if (!host) { console.warn("SMTP_HOST not configured — order email not sent."); return "smtp_not_configured"; }
  const lines = [
    `Nouvelle commande #${order.id}`,
    `Statut : ${order.status}`,
    `Client : ${order.customer_name}`,
    `Email : ${order.customer_email}`,
    `Téléphone : ${order.customer_phone}`,
    `Zone : ${order.delivery_zone}`,
    `Adresse : ${order.delivery_address}`,
    `Suivi : /api/orders/${order.id}?token=${order.tracking_token}`,
    "",
    "Produits :",
    ...items.map((i) => `- ${i.titre} (${i.auteur}) x${i.qty} : ${i.prix * i.qty} FCFA`),
    "",
    `Total : ${order.total} FCFA`,
  ];
  try {
    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || "587"),
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@librairie-magma.local",
      to: process.env.ORDER_EMAIL || "moussokiexauce7@gmail.com",
      subject: `Commande Librairie Magma #${order.id}`,
      text: lines.join("\n"),
    });
    return "sent";
  } catch (e) {
    console.error("Unable to send order email:", e.message);
    return "failed";
  }
}

function generateReceiptPdf(order, items, res) {
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="recu-commande-${order.id}.pdf"`);
  doc.pipe(res);
  doc.fontSize(24).font("Helvetica-Bold").text("Librairie Magma", { align: "center" });
  doc.moveDown(0.3);
  doc.fontSize(16).font("Helvetica-Bold").text(`Reçu de commande #${order.id}`, { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(11).font("Helvetica").text(`Statut : ${order.status}`);
  doc.text(`Date : ${order.created_at}`);
  doc.moveDown(0.5);
  doc.fontSize(13).font("Helvetica-Bold").text("Client");
  doc.fontSize(11).font("Helvetica");
  doc.text(order.customer_name);
  doc.text(order.customer_email);
  doc.text(order.customer_phone);
  doc.text(`Livraison : ${order.delivery_zone} — ${order.delivery_address}`);
  doc.moveDown(0.7);
  const tableTop = doc.y;
  const colWidths = [200, 130, 40, 80, 90];
  const headers = ["Livre", "Auteur", "Qté", "Prix", "Sous-total"];
  doc.font("Helvetica-Bold").fontSize(10);
  let x = 50;
  headers.forEach((h, i) => { doc.text(h, x, tableTop, { width: colWidths[i], align: "left" }); x += colWidths[i]; });
  doc.moveDown(0.2);
  doc.font("Helvetica").fontSize(10);
  items.forEach((item) => {
    const y = doc.y;
    x = 50;
    [item.titre, item.auteur, String(item.qty), `${item.prix} FCFA`, `${item.prix * item.qty} FCFA`]
      .forEach((val, i) => { doc.text(val, x, y, { width: colWidths[i], align: "left" }); x += colWidths[i]; });
    doc.moveDown(0.2);
  });
  doc.moveDown(0.3);
  doc.font("Helvetica-Bold").fontSize(12).text(`Total : ${order.total} FCFA`, { align: "right" });
  doc.moveDown(0.5);
  doc.font("Helvetica-Oblique").fontSize(9).text("Annulation possible uniquement dans les 5 minutes suivant la validation.");
  doc.end();
}

router.get("/api/delivery-zones", requireUser(), (req, res) => {
  res.json(ALLOWED_DELIVERY_ZONES);
});

router.post("/api/orders", requireUser(), async (req, res) => {
  const cart = req.session.cart || [];
  if (!cart.length) return res.status(400).json({ error: "Votre panier est vide." });
  const data = req.body || {};
  const user = getCurrentUser(req);
  try {
    const customer_name = cleanText(data.customer_name || (user || {}).name, 140, true);
    const customer_email = cleanEmail(data.customer_email || (user || {}).email);
    const customer_phone = cleanPhone(data.customer_phone);
    const delivery_zone = cleanText(data.delivery_zone, 120, true);
    const delivery_address = cleanText(data.delivery_address, 260, true);
    if (!ALLOWED_DELIVERY_ZONES.includes(delivery_zone))
      return res.status(400).json({ error: "Livraison impossible : cette adresse est hors zone. Zones autorisées : Potopoto la gare, Total vers Saint Exupérie, Présidence, OSH, CHU." });

    const db = getDb();
    const validItems = [];
    let total = 0;
    for (const item of cart) {
      const row = db.prepare("SELECT * FROM books WHERE id = ?").get(item.id);
      if (!row) { db.close(); return res.status(400).json({ error: `Le livre ${item.titre} n'est plus disponible.` }); }
      const book = rowToBook(row);
      const qty = Math.min(cleanInt(item.qty, 1, 1), book.stock);
      if (qty <= 0) { db.close(); return res.status(400).json({ error: `Le livre ${book.titre} est en rupture de stock.` }); }
      validItems.push({ book_id: book.id, titre: book.titre, auteur: book.auteur, prix: book.prix, qty, image: book.image });
      total += book.prix * qty;
    }

    const created_at = nowIso();
    const tracking_token = crypto.randomBytes(18).toString("base64url");
    const orderResult = db.prepare(
      "INSERT INTO orders (user_id, customer_name, customer_email, customer_phone, delivery_zone, delivery_address, total, status, email_status, tracking_token, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"
    ).run((user || {}).id || null, customer_name, customer_email, customer_phone, delivery_zone, delivery_address, total, "En attente", "pending", tracking_token, created_at, created_at);
    const orderId = orderResult.lastInsertRowid;

    for (const item of validItems) {
      db.prepare("INSERT INTO order_items (order_id, book_id, titre, auteur, prix, qty, image) VALUES (?,?,?,?,?,?,?)").run(orderId, item.book_id, item.titre, item.auteur, item.prix, item.qty, item.image);
      db.prepare("UPDATE books SET stock = MAX(stock - ?, 0) WHERE id = ?").run(item.qty, item.book_id);
    }
    db.prepare("UPDATE orders SET email_status = 'pending' WHERE id = ?").run(orderId);
    db.close();

    const emailStatus = await sendOrderEmail({ id: orderId, customer_name, customer_email, customer_phone, delivery_zone, delivery_address, total, status: "En attente", tracking_token, created_at }, validItems);
    const db2 = getDb();
    db2.prepare("UPDATE orders SET email_status = ? WHERE id = ?").run(emailStatus, orderId);
    const order = db2.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
    db2.close();

    req.session.cart = [];
    const deadline = new Date(new Date(created_at + "Z").getTime() + CANCEL_WINDOW_MINUTES * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "");
    return res.status(201).json({ success: true, order, receipt_url: `/api/orders/${orderId}/receipt.pdf`, tracking_url: `/api/orders/${orderId}?token=${tracking_token}`, cancel_until: deadline });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

router.get("/api/orders/:id", (req, res) => {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(parseInt(req.params.id));
  if (!order) { db.close(); return res.status(404).json({ error: "Commande non trouvée" }); }
  if (!userCanAccessOrder(req, order)) { db.close(); return res.status(403).json({ error: "Accès à cette commande refusé." }); }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(parseInt(req.params.id));
  db.close();
  res.json(rowToOrder(order, items));
});

router.post("/api/orders/:id/cancel", (req, res) => {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(parseInt(req.params.id));
  if (!order) { db.close(); return res.status(404).json({ error: "Commande non trouvée" }); }
  if (!userCanAccessOrder(req, order)) { db.close(); return res.status(403).json({ error: "Accès à cette commande refusé." }); }
  if (order.status === "Annulée") { db.close(); return res.status(400).json({ error: "Cette commande est déjà annulée." }); }
  const deadline = new Date(new Date(order.created_at + "Z").getTime() + CANCEL_WINDOW_MINUTES * 60 * 1000);
  if (new Date() > deadline) { db.close(); return res.status(400).json({ error: "Le délai d'annulation de 5 minutes est dépassé." }); }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(parseInt(req.params.id));
  for (const item of items) {
    if (item.book_id) db.prepare("UPDATE books SET stock = stock + ? WHERE id = ?").run(item.qty, item.book_id);
  }
  const n = nowIso();
  db.prepare("UPDATE orders SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ?").run("Annulée", n, n, parseInt(req.params.id));
  db.close();
  res.json({ success: true, status: "Annulée" });
});

router.get("/api/orders/:id/receipt.pdf", (req, res) => {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(parseInt(req.params.id));
  if (!order) { db.close(); return res.status(404).json({ error: "Commande non trouvée" }); }
  if (!userCanAccessOrder(req, order)) { db.close(); return res.status(403).json({ error: "Accès à cette commande refusé." }); }
  const RECEIPT_OK = ["Confirmée", "En livraison", "Livrée", "Reçue", "Validée"];
  if (!RECEIPT_OK.includes(order.status)) {
    db.close();
    return res.status(403).json({ error: "Le reçu sera disponible dès que la commande sera confirmée par l'administrateur." });
  }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(parseInt(req.params.id));
  db.close();
  generateReceiptPdf(order, items, res);
});

router.post("/api/orders/:id/confirm-reception", requireUser(), (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) { db.close(); return res.status(404).json({ error: "Commande non trouvée." }); }
  if (!userCanAccessOrder(req, order)) { db.close(); return res.status(403).json({ error: "Accès à cette commande refusé." }); }
  if (order.client_confirmed) { db.close(); return res.status(400).json({ error: "Réception déjà confirmée." }); }
  if (!["En livraison", "Livrée"].includes(order.status)) {
    db.close();
    return res.status(400).json({ error: "La commande doit être en livraison ou livrée pour confirmer la réception." });
  }
  const now = nowIso();
  db.prepare("UPDATE orders SET client_confirmed = 1, updated_at = ? WHERE id = ?").run(now, orderId);
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (updated.admin_confirmed && updated.client_confirmed && updated.status !== "Validée") {
    db.prepare("UPDATE orders SET status = 'Validée', validated_at = ?, updated_at = ? WHERE id = ?").run(now, now, orderId);
  }
  const final = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
  db.close();
  res.json(rowToOrder(final, items));
});

router.post("/api/orders/:id/mark-received", requireUser(), (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) { db.close(); return res.status(404).json({ error: "Commande non trouvée." }); }
  if (!userCanAccessOrder(req, order)) { db.close(); return res.status(403).json({ error: "Accès à cette commande refusé." }); }
  if (order.status === "Annulée") { db.close(); return res.status(400).json({ error: "Cette commande a été annulée." }); }
  if (order.status === "Reçue") { db.close(); return res.status(400).json({ error: "Réception déjà confirmée." }); }
  const now = nowIso();
  db.prepare("UPDATE orders SET status = 'Reçue', client_received = 1, client_confirmed = 1, received_at = ?, updated_at = ? WHERE id = ?").run(now, now, orderId);
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
  db.close();
  res.json(rowToOrder(updated, items));
});

router.post("/api/orders/:id/report-not-received", requireUser(), async (req, res) => {
  const db = getDb();
  const orderId = parseInt(req.params.id);
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  if (!order) { db.close(); return res.status(404).json({ error: "Commande non trouvée." }); }
  if (!userCanAccessOrder(req, order)) { db.close(); return res.status(403).json({ error: "Accès à cette commande refusé." }); }
  if (order.status === "Annulée") { db.close(); return res.status(400).json({ error: "Cette commande a été annulée." }); }
  if (order.status === "Reçue") { db.close(); return res.status(400).json({ error: "Cette commande a déjà été marquée reçue." }); }
  const reason = cleanText((req.body || {}).reason || "Non précisé", 500, true);
  const now = nowIso();
  db.prepare("UPDATE orders SET not_received_reported_at = ?, not_received_reason = ?, updated_at = ? WHERE id = ?").run(now, reason, now, orderId);
  const updated = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId);
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
  db.close();
  try {
    const host = process.env.SMTP_HOST;
    if (host) {
      const transporter = nodemailer.createTransport({
        host,
        port: parseInt(process.env.SMTP_PORT || "587"),
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@librairie-magma.local",
        to: process.env.ORDER_EMAIL || "moussokiexauce7@gmail.com",
        subject: `[ALERTE] Commande #${orderId} signalée non reçue`,
        text: `Le client ${updated.customer_name} (${updated.customer_email}, ${updated.customer_phone}) a signalé que la commande #${orderId} n'a pas été reçue.\n\nRaison : ${reason}\n\nZone : ${updated.delivery_zone}\nMontant : ${updated.total} FCFA\nStatut actuel : ${updated.status}\nDate commande : ${updated.created_at}`,
      });
    } else {
      console.warn(`[ADMIN-NOTIFY] Commande #${orderId} signalée non reçue — raison: ${reason}`);
    }
  } catch (e) { console.error("Notification admin échouée:", e.message); }
  res.json(rowToOrder(updated, items));
});

router.get("/api/my-orders", requireUser(), (req, res) => {
  const user = getCurrentUser(req);
  const db = getDb();
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC").all(user.id);
  const result = orders.map((row) => {
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(row.id);
    return rowToOrder(row, items);
  });
  db.close();
  res.json(result);
});

module.exports = { router, ORDER_STATUSES };
