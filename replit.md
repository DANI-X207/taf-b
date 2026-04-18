# Mayombe — Librairie en Ligne

## Description
Mayombe / Librairie Magma est une librairie en ligne Flask + SQLite. Le frontend importé reste organisé en pages HTML séparées, avec une couche JavaScript qui corrige et complète les fonctions e-commerce.

## Stack Technique
- **Backend** : Python 3 / Flask 3
- **Base de données** : SQLite (`data/bookstore.db`)
- **Frontend** : HTML/CSS/JS standards, pages séparées dans `public/html/`
- **PDF** : ReportLab pour les reçus téléchargeables
- **Serveur dev Replit** : `gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app`

## Architecture

```
app.py                    ← Flask app, API, SQLite, commandes, PDF, admin
main.py                   ← Point d'entrée Gunicorn
public/html/              ← Pages HTML séparées conservées
public/html/Admin.html    ← Onglet Admin protégé
public/js/bookstore.js    ← Catalogue, panier, commande, admin, avis, pubs
data/bookstore.db         ← Base SQLite créée automatiquement
```

## Fonctionnalités
- Catalogue avec recherche texte et filtre par catégorie.
- Panier avec ajout/suppression.
- Commande avec validation de zone de livraison.
- Annulation possible pendant 5 minutes après validation.
- Reçu PDF téléchargeable par commande.
- Notification email automatique tentée vers `moussokiexauce7@gmail.com` si `SMTP_HOST` est configuré.
- Admin protégé par mot de passe `TAF1-FLEMME`.
- Admin : ajout, modification, suppression de livres et gestion des publicités.
- Avis clients : note et commentaire par livre.

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
gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app
```
