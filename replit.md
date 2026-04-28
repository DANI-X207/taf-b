# Librairie Magma — Librairie en Ligne

## Description
Librairie Magma est une librairie en ligne Python/Flask + SQLite. Le frontend WEBDEV exporté reste organisé en pages HTML séparées dans `public/html/` ; les protections, l'authentification et toutes les fonctionnalités métier sont gérées par le serveur Flask (`app.py`, point d'entrée `main.py` lancé par gunicorn sur le port 5000).

## Mises à jour récentes (avril 2026)
- **Topbar 100% identique sur 11 pages** : logo Magma + barre de recherche + Accueil/Mon Magma/à propos + icônes Compte/Panier/Commandes/Paramètres sur `vitrine`, `Accueil-v2`, `a-propos`, `catalogue`, `panier`, `PI_Produit`, `conditions`, `confidentialite`, `mon-compte`, `mes-commandes`, `parametres`. La barre de recherche soumet vers `/catalogue.html?q=…`.
- **Logo plus grand** : `.logo-img` agrandi à 72px (de 42px → 56px → 72px), `.topbar` à 88px de haut, drop-shadow orange + zoom au survol.
- **Plus de ligne blanche dans la topbar** : `bookstore.js setupResponsiveTopbar` injecte un `<style id="magma-menu-toggle-style">` qui force `.menu-toggle{display:none !important;visibility:hidden;width:0;height:0}` sur desktop (>980px) et restaure le bouton hamburger en mobile. Règles renforcées dans `magma-fixes.css` et inline dans `vitrine`/`Accueil-v2`/`PI_Produit`.
- **Badge admin restauré** : la règle `#magma-admin-link{display:none}` retirée des 11 pages publiques. Le badge flottant orange « ⚙ Admin » apparaît en bas à droite dès que `/api/admin/status` confirme la session admin (par numéro de téléphone ou mot de passe), pointant vers `/admin.html` ou `/super-admin.html` selon `is_super`. Vérifié en local et en production.
- **Système de publicités entièrement supprimé** : retrait des fonctions `showAdNotification`/`startAdRotator` (+ init) de `bookstore.js`, des routes `/api/ads`, `/api/admin/ads` (GET/POST/DELETE) et de la table `ads` (avec `DROP TABLE IF EXISTS ads`) dans `app.py`, ainsi que de l'onglet Publicités, des compteurs dashboard et du formulaire d'admin dans `Admin.html`.
- **`register.html` redesigné fond blanc** : page autonome single-card centrée sur fond blanc, topbar partagée (logo + bouton « Retour à l'accueil »), media queries 760px/380px pour mobile, formatage automatique du téléphone et gestion d'erreurs. `bookstore.js` détecte `MAGMA_REGISTER_PAGE_HAS_FORM` pour ne pas injecter de doublon.
- **Confidentialité du propriétaire** : tous les exemples « 06-548-7909 » remplacés par `XX-XX-XXXX` dans `app.py`, `bookstore.js` et `confidentialite.html`. Le numéro réel reste utilisé uniquement pour la reconnaissance admin.
- **Page d'accueil conditionnelle** : les visiteurs anonymes voient `vitrine.html` (catalogue de présentation public), les utilisateurs connectés voient `Accueil-v2.html`.
- **Catalogue public** : `/api/books`, `/api/books/<id>`, `/api/books/<id>/reviews` (GET), `/api/books/featured` et `/api/genres` ne nécessitent plus d'authentification — tout le monde peut feuilleter et lire les avis.
- **Page détail livre `PI_Produit.html`** : entièrement reconstruite (couverture, titre, auteur, résumé, prix, stock, commentaires). Lecture publique ; ajouter au panier ou poster un avis redirige vers `/login.html` si non connecté.
- **Bouton « Ajouter au panier » sur la vitrine** : si l'utilisateur n'est pas connecté, un message l'invite à se connecter et il est redirigé vers `/login.html`.
- **Numéro de téléphone obligatoire à l'inscription** (`/api/auth/register`).
- **Reconnaissance admin par numéro de téléphone** :
  - Table `admin_phones` (PK `phone` normalisé en chiffres uniquement, `is_super` 0/1).
  - Numéros initiaux : `065487909` (super), `050271841`, `064280982`, `066342094`, `066059986`, `069680847` (admins normaux).
  - À la connexion, si le téléphone du compte figure dans `admin_phones`, l'utilisateur est automatiquement reconnu comme admin (pas besoin du mot de passe `TAF1-FLEMME`/`MMDE2007`).
  - `/api/admin/status` renvoie `{authenticated, role, is_super, via_phone}`.
- **Lien « Espace administrateur » dans `parametres.html`** : visible uniquement si `/api/admin/status` indique que le compte est admin ; pointe vers `/admin.html` ou `/super-admin.html` selon `is_super`.
- **Gestion des numéros admin** :
  - `GET /api/admin/phones` (admin) — liste.
  - `POST /api/admin/phones` (admin et super-admin) — ajoute un numéro ; seul un super-admin peut le marquer `is_super`.
  - `DELETE /api/admin/phones/<phone>` (super-admin uniquement) — retire un numéro.

## Stack Technique
- **Backend** : Node.js 20 / Express 4
- **Base de données** : SQLite (`data/bookstore.db`) via `better-sqlite3` (synchrone)
- **Frontend** : HTML/CSS/JS standards, pages séparées dans `public/html/`
- **PDF** : PDFKit pour les reçus téléchargeables
- **Email** : Nodemailer (optionnel, si SMTP configuré)
- **ZIP source** : archiver
- **Sécurité** : mots de passe hashés bcrypt (cost 12), sessions express-session HttpOnly/Secure/SameSite strict
- **Serveur dev** : `node server.js` (port 5000)
- **Config** : `.env` (voir `.env.example`)

## Architecture

```
server.js                  ← Point d'entrée Express (session, routes, statiques)
src/
  db.js                    ← Init SQLite, schema, migrations, seed livres/publicités
  helpers.js               ← Validation : cleanText/Email/Password/Phone/Url, rowToBook
  middleware.js            ← requireAdmin, requireUser, getCurrentUser, isAuthenticated
  routes/
    auth.js                ← POST /auth/register, /auth/login, /auth/logout + /api/auth/*
    books.js               ← GET/POST/PUT/DELETE /api/books*, /api/genres
    cart.js                ← GET/POST/DELETE /api/cart/*
    orders.js              ← POST /api/orders, GET/cancel/receipt /api/orders/:id
    reviews.js             ← POST /api/reviews
    admin.js               ← /api/admin/* (login, orders, ads, livres)
    pages.js               ← Serveur HTML avec injection CSS/JS/shims, authPageHtml, /api/ads, /api/source.zip
public/
  html/                    ← Pages HTML WEBDEV (index, MABOUTIQUE, PI_Produit, Formulaire, Admin…)
  css/magma-fixes.css      ← Corrections CSS layout injectées dans chaque page
  js/bookstore.js          ← Frontend JS injecté dans chaque page
  img/                     ← Images statiques
data/bookstore.db          ← SQLite créée automatiquement
.env / .env.example        ← Variables d'environnement
package.json               ← Dépendances Node.js
```

## Fonctionnalités
- Compte client obligatoire avant accès au catalogue, panier, avis et commande.
- Création/connexion client avec validation claire des champs.
- Catalogue avec recherche texte et filtre par catégorie.
- Panier avec ajout/suppression (stocké en session).
- Commande avec validation de zone de livraison.
- Annulation possible pendant 5 minutes après validation.
- Suivi de commande : En attente → Confirmée → En livraison → Livrée.
- Reçu PDF téléchargeable par commande.
- Notification email automatique si `SMTP_HOST` est configuré.
- Admin protégé par mot de passe (`ADMIN_PASSWORD`, défaut `TAF1-FLEMME`).
- Admin : gestion complète — Utilisateurs, Livres, Commandes, Publicités, Téléchargements.
  - Section Utilisateurs : liste avec nom, email, date inscription, dernière connexion, nb commandes.
  - Chaque item (livre, commande, utilisateur, publicité) cliquable → modal détail complet.
  - Statut commande modifiable depuis le modal de détail.
  - Source ZIP via `/api/source.zip` protégé admin uniquement (`req.session.admin_authenticated`).
- Connexion accepte email OU nom d'utilisateur (champ unique `email` envoyé).
- Mot de passe oublié : modal de triple vérification (nom, téléphone, email), token sécurisé expirant en 15 minutes, page `/reset-password?token=...`, hash bcrypt et fermeture de session après réinitialisation.
- Si compte déjà existant lors de l'inscription → redirection vers `/login.html?info=…`.
- Déconnexion vide la session complète + efface le cookie `magma_sid`.
- Avis clients : note 1–5 et commentaire par livre via `/api/reviews`, réponse JSON explicite et ajout immédiat dans la section Avis récents.

## Zone de livraison
Livraison autorisée uniquement pour : Potopoto la gare, Total vers Saint Exupérie, Présidence, OSH, CHU.

## Email de commande
Pour activer l'envoi réel des emails, configurer dans `.env` :
- `SMTP_HOST`, `SMTP_PORT` (défaut 587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`

Sans SMTP, la commande fonctionne et le statut email est enregistré comme `smtp_not_configured`.

## Démarrage
```bash
node server.js
```
Ou avec nodemon pour le rechargement automatique en développement :
```bash
npx nodemon server.js
```

## Réception des commandes (règle métier)
- Le bouton « Valider la réception » sur `mes-commandes.html` apparaît dès que l'administrateur passe la commande à **« En livraison »** ou **« Livrée »**.
  - **En livraison** → le client peut directement confirmer la réception (passe en « Reçue »).
  - **Livrée** → l'admin a déjà donné la 1ʳᵉ confirmation, on attend celle du client (bandeau vert d'information).
- Tant que le statut est « En attente » ou « Confirmée », un bandeau gris demande au client de patienter.
- Routes appliquant la règle (Flask `app.py` ET Node `src/routes/orders.js`) : `POST /api/orders/<id>/mark-received` refusé tant que `status` n'est ni « En livraison » ni « Livrée ».
- Colonnes orders ajoutées : `admin_confirmed`, `client_confirmed`, `client_received`, `received_at`, `not_received_reported_at`, `not_received_reason`, `validated_at`.

## Chronomètre d'annulation côté client
- Toute commande renvoie `cancel_until` (ISO). `mes-commandes.html` affiche en direct « Chronomètre — annulation possible pendant encore mm:ss » avec un bouton « Annuler la commande » tant que la fenêtre de 5 min (CANCEL_WINDOW_MINUTES) n'est pas écoulée.
- **Important — fuseau horaire** : Flask renvoie ses ISO sans suffixe `Z`, mais les timestamps sont en UTC. Le helper `parseServerDate()` dans `mes-commandes.html` ajoute systématiquement `Z` quand aucun marqueur de fuseau n'est présent — sans cela, le navigateur interprétait les dates comme heure locale et le compteur s'affichait « expiré » dès la création (bug visible avant le 28/04/2026).

## Layout WEBDEV — règles importantes
- Ne JAMAIS toucher au `margin-top` de `.pos45` (valeur fixée à 211px — positionne la section orange sous les catégories).
- Ne jamais modifier les couleurs ni le layout WEBDEV exporté.
- Toujours modifier via `public/css/magma-fixes.css` ou `public/js/bookstore.js`.
