# Mayombe — Librairie en Ligne

## Description
Mayombe / Librairie Magma est une librairie en ligne Flask + SQLite. Le frontend importé reste organisé en pages HTML séparées et n'a pas été modifié ; les nouvelles protections et fonctionnalités sont gérées côté serveur.

## Stack Technique
- **Backend** : Python 3 / Flask 3
- **Base de données** : SQLite (`data/bookstore.db`)
- **Frontend** : HTML/CSS/JS standards, pages séparées dans `public/html/`
- **PDF** : ReportLab pour les reçus téléchargeables
- **Sécurité** : mots de passe hashés Werkzeug, sessions Flask HttpOnly/Secure/SameSite strict
- **Serveur dev Replit** : `python -m gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app`
- **Publication Replit** : `python -m gunicorn --bind 0.0.0.0:5000 main:app`
- **Compatibilité** : `requirements.txt`, `vercel.json`, `netlify.toml`, fonction Netlify WSGI

## Architecture

```
app.py                    ← Flask app, API, SQLite, auth, commandes, PDF, admin, ZIP source
main.py                   ← Point d'entrée Gunicorn/Vercel
netlify/functions/app.py  ← Adaptateur serverless Netlify
public/html/              ← Pages HTML séparées conservées
public/html/Admin.html    ← Espace admin protégé
public/js/bookstore.js    ← Frontend importé conservé
requirements.txt          ← Dépendances Python pour plateformes externes
data/bookstore.db         ← Base SQLite créée automatiquement
```

## Fonctionnalités
- Compte client obligatoire avant accès au catalogue, panier, avis et commande.
- Création/connexion client avec validation claire des champs.
- Catalogue avec recherche texte et filtre par catégorie.
- Panier avec ajout/suppression.
- Commande avec validation de zone de livraison.
- Annulation possible pendant 5 minutes après validation.
- Suivi de commande : En attente → Confirmée → En livraison → Livrée.
- Reçu PDF téléchargeable par commande.
- Notification email automatique tentée vers `moussokiexauce7@gmail.com` si `SMTP_HOST` est configuré.
- Admin protégé par mot de passe `TAF1-FLEMME`.
- Admin : ajout, modification, suppression de livres, gestion des publicités et statuts de commandes via API.
- Avis clients : note 1–5 et commentaire par livre.
- Export ZIP du code source via `/api/source.zip` ou `/download-source.zip` après connexion.

## Zone de livraison
Livraison autorisée uniquement pour : Potopoto la gare, Total vers Saint Exupérie, Présidence, OSH, CHU. Toute autre zone est refusée côté serveur avec un message clair.

## Email de commande
Pour activer l'envoi réel des emails, configurer les variables d'environnement :
- `SMTP_HOST`
- `SMTP_PORT` (par défaut 587)
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM` (optionnel)

Sans SMTP, la commande fonctionne et le statut email est enregistré comme `smtp_not_configured`.

## Démarrage
```bash
python -m gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app
```
