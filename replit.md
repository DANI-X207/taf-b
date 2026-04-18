# Mayombe

## Project Overview
Mayombe is a static e-commerce marketplace website originally generated with WEBDEV 25 (PC SOFT). It features product browsing, a shopping cart, seller management, and product listing pages.

## Tech Stack
- **Frontend:** Static HTML5, CSS3, JavaScript
- **Server (dev):** Python's built-in HTTP server

## Project Structure
```
public/
  html/     - All HTML pages (index.html, login.html, Mon-panier.html, etc.)
  css/      - Stylesheets (Mayombe.css, page-specific styles, RWD styles)
  img/      - Product and UI images
```

## Pages
- `index.html` - Homepage with product catalog
- `login.html` - User authentication
- `Mon-panier.html` - Shopping cart
- `MABOUTIQUE.html` - Seller/store management
- `Ajout-Produit.html` - Add product form
- `PI_Produit.html` - Product detail page
- `Formulaire.html` - Generic form page

## Running the App
The workflow runs: `python3 -m http.server 5000 --directory public/html`

## Deployment
Configured as a **static** deployment with `publicDir: public/html`.
