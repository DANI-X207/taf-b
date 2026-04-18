# Mayombe — Librairie en Ligne

## Description
Mayombe est une librairie en ligne dynamique. Le frontend conserve le design WEBDEV 25 original, enrichi d'une couche JavaScript (`bookstore.js`) qui connecte les pages à un backend Flask + SQLite.

## Stack Technique
- **Backend** : Python 3 / Flask 3
- **Base de données** : SQLite (`data/bookstore.db`)
- **Frontend** : HTML/CSS statique (WEBDEV 25) + `public/js/bookstore.js` injecté dynamiquement
- **Serveur dev** : `python3 app.py` (port 5000)

## Architecture

```
app.py                    ← Flask app (API + serveur fichiers)
data/bookstore.db         ← Base SQLite (créée automatiquement)
public/
  html/                   ← Pages HTML (design WEBDEV inchangé)
  css/                    ← Feuilles de style
  img/                    ← Images
  js/
    bookstore.js          ← Logique dynamique injectée dans chaque page
```

## Pages & Fonctionnalités
| Page | Fonction dynamique |
|---|---|
| `/` (index.html) | Grille de livres depuis l'API, recherche, filtres genres |
| `/Mon-panier.html` | Affichage et gestion du panier (session Flask) |
| `/Ajout-Produit.html` | Formulaire d'ajout d'un livre via l'API |
| `/PI_Produit.html?id=X` | Détail d'un livre par ID |
| `/MABOUTIQUE.html` | Vue vendeur : liste + suppression des livres |

## API REST
| Méthode | Endpoint | Description |
|---|---|---|
| GET | `/api/books` | Tous les livres (filtres: `?genre=`, `?search=`) |
| GET | `/api/books/featured` | Livres en vedette |
| GET | `/api/books/<id>` | Détail d'un livre |
| POST | `/api/books` | Ajouter un livre |
| DELETE | `/api/books/<id>` | Supprimer un livre |
| GET | `/api/cart` | Contenu du panier (session) |
| POST | `/api/cart/add` | Ajouter au panier `{id, qty}` |
| DELETE | `/api/cart/remove/<id>` | Retirer un livre du panier |
| DELETE | `/api/cart/clear` | Vider le panier |
| GET | `/api/genres` | Liste des genres disponibles |

## Démarrage
```bash
python3 app.py
```
La base de données SQLite est initialisée automatiquement au démarrage avec 12 livres de démonstration.
