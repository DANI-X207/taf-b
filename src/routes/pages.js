const express = require("express");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const { isAuthenticated } = require("../middleware");

const router = express.Router();

const SITE_NAME = "Librairie Magma";
const PUBLIC_HTML = path.join(__dirname, "..", "..", "public", "html");
const PUBLIC_CSS = path.join(__dirname, "..", "..", "public", "css");
const PUBLIC_IMG = path.join(__dirname, "..", "..", "public", "img");
const PUBLIC_JS = path.join(__dirname, "..", "..", "public", "js");
const BASE_DIR = path.join(__dirname, "..", "..");

const PAGE_TITLES = {
  index: `${SITE_NAME} — Accueil`,
  login: `${SITE_NAME} — Connexion`,
  "Mon-panier": `${SITE_NAME} — Mon Panier`,
  "Ajout-Produit": `${SITE_NAME} — Ajouter un Livre`,
  MABOUTIQUE: `${SITE_NAME} — Ma Boutique`,
  PI_Produit: `${SITE_NAME} — Détail du Livre`,
  Formulaire: `${SITE_NAME} — Formulaire`,
  "PAGEMOD-Accueil": SITE_NAME,
  Admin: `${SITE_NAME} — Admin`,
};

const PROTECTED_PAGES = new Set(["index.html", "PAGEMOD-Accueil.html", "PI_Produit.html", "Mon-panier.html", "Formulaire.html", "mon-compte.html", "mes-commandes.html", "parametres.html"]);
const AUTH_PAGES = new Set(["login.html", "connexion.html", "register.html", "inscription.html"]);

const HEAD_COMPAT = `<script>
window.clWDUtil = new Proxy(window.clWDUtil || {}, {
  get: function(target, prop) {
    if (prop in target) return target[prop];
    if (prop === "pfGetTraitement") return function() { return function() {}; };
    return function() { return function() {}; };
  }
});
window.oGetObjetChamp = window.oGetObjetChamp || function() {
  return { OnClick: function(){}, OnMouseOver: function(){}, OnMouseOut: function(){} };
};
window.WDBandeauDefilant = window.WDBandeauDefilant || function() {
  return { Init:function(){}, Demarre:function(){}, Arrete:function(){} };
};
["WDAnim","WDChamp","WDDrag","WDImage","WDMenu","WDOnglet","WDSaisie","WDTableZRCommun","WDUtil","WDZRNavigateur"]
.forEach(function(name) {
  window[name] = window[name] || function() {
    return { Init:function(){}, OnClick:function(){}, OnMouseOver:function(){}, OnMouseOut:function(){} };
  };
});
window.wbImgHomNav = window.wbImgHomNav || function(){};
</script>
</head>`;

function authPageHtml(message = "") {
  const msg = message ? `<p class="error">${message.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</p>` : "";
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${SITE_NAME} — Connexion client</title>
<style>
body{margin:0;min-height:100vh;background:linear-gradient(135deg,#ff690c,#f59e0b 45%,#2b293a);font-family:Arial,sans-serif;color:#2b293a;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}
main{width:min(980px,100%);background:rgba(255,255,255,.96);border-radius:28px;padding:28px;box-shadow:0 30px 90px rgba(0,0,0,.25);}
h1{margin:0 0 8px;font-size:34px;}p{line-height:1.5;}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px;margin-top:20px;}
.card{background:#fff7ed;border:1px solid #fed7aa;border-radius:20px;padding:20px;}
input{width:100%;padding:12px;margin:7px 0;border:1px solid #ddd;border-radius:12px;box-sizing:border-box;}
button,.link{display:inline-block;background:#ff690c;color:#fff;border:0;border-radius:999px;padding:12px 18px;text-decoration:none;font-weight:700;cursor:pointer;margin-top:8px;}
.admin{background:#2b293a;}.error{background:#fee4e2;color:#b42318;padding:12px;border-radius:12px;}
.small{font-size:13px;color:#667085;}
</style>
</head>
<body>
<main>
<h1>${SITE_NAME}</h1>
<p>Créez un compte ou connectez-vous pour accéder au catalogue, au panier et aux commandes.</p>
${msg}
<div class="grid">
<section class="card">
<h2>Créer un compte</h2>
<form method="post" action="/auth/register">
<input name="name" placeholder="Nom complet" required maxlength="120" autocomplete="name">
<input name="email" type="email" placeholder="Email" required maxlength="180" autocomplete="email">
<input name="phone" placeholder="Numéro de téléphone" required maxlength="40" autocomplete="tel">
<input name="password" type="password" placeholder="Mot de passe avec lettre et chiffre" required minlength="8" autocomplete="new-password">
<button type="submit">Créer mon compte</button>
</form>
</section>
<section class="card">
<h2>Déjà client</h2>
<form method="post" action="/auth/login">
<input name="email" type="email" placeholder="Email" required maxlength="180" autocomplete="email">
<input name="password" type="password" placeholder="Mot de passe" required autocomplete="current-password">
<button type="submit">Me connecter</button>
</form>
<p class="small"><a href="#" id="forgot-password-link">Mot de passe oublié</a></p>
</section>
</div>
<p><a class="link admin" href="/Admin.html">Connexion Admin</a> <a class="link" href="/api/source.zip">Télécharger le code source</a></p>
<p class="small">Session sécurisée : cookie HttpOnly, Secure, SameSite strict, expiration configurable à 7 jours par défaut.</p>
</main>
</body>
</html>`;
}

function serveHtml(filename, req, res) {
  if (AUTH_PAGES.has(filename)) {
    if (isAuthenticated(req)) return res.redirect("/");
  }
  if (PROTECTED_PAGES.has(filename) && !isAuthenticated(req)) {
    return res.redirect("/login.html");
  }
  const filepath = path.join(PUBLIC_HTML, filename);
  if (!fs.existsSync(filepath)) return res.status(404).send("Page non trouvée");

  let content = fs.readFileSync(filepath, "utf8");
  const pageKey = filename.replace(/\.html$/, "");
  const newTitle = PAGE_TITLES[pageKey] || SITE_NAME;
  content = content.replace(/<title>[^<]*<\/title>/, `<title>${newTitle}</title>`);
  content = content.replace(/(>)([^<]*)Mayombe([^<]*<)/g, (m, a, b, c) => a + b + SITE_NAME + c);
  if (!content.includes("window.clWDUtil")) {
    content = content.replace("</head>", HEAD_COMPAT);
  }
  if (!content.includes("magma-fixes.css")) {
    content = content.replace("</head>", '<link rel="stylesheet" type="text/css" href="/magma-fixes.css"></head>');
  }
  if (!content.includes("/js/bookstore.js")) {
    content = content.replace("</body>", '<script src="/js/bookstore.js"></script></body>');
  }
  res.type("html").send(content);
}

router.get("/", (req, res) => serveHtml("index.html", req, res));

router.get("/favicon.ico", (req, res) => res.status(204).end());

router.get("/:filename([^/]+\\.html)", (req, res) => serveHtml(req.params.filename, req, res));

router.get(/^\/(.+\.html)$/, (req, res) => serveHtml(req.params[0], req, res));

router.get("/api/ads", (req, res) => {
  const { getDb } = require("../db");
  const db = getDb();
  const ads = db.prepare("SELECT * FROM ads WHERE active = 1 ORDER BY id DESC").all();
  db.close();
  res.json(ads);
});

router.get("/api/source.zip", (req, res) => {
  if (!req.session.admin_authenticated) return res.status(403).json({ error: "Accès réservé à l'administrateur." });
  const excludedDirs = new Set([".git", ".cache", ".pythonlibs", "__pycache__", "node_modules", ".local"]);
  const excludedFiles = new Set(["data/bookstore.db"]);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="librairie-magma-source.zip"');
  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);
  archive.glob("**/*", {
    cwd: BASE_DIR,
    ignore: [
      ".git/**", ".cache/**", ".pythonlibs/**", "__pycache__/**", "node_modules/**",
      ".local/**", "data/bookstore.db", "**/*.pyc", "attached_assets/**",
    ],
  });
  archive.finalize();
});

router.get("/download-source.zip", (req, res) => res.redirect("/api/source.zip"));

module.exports = { router, authPageHtml };
