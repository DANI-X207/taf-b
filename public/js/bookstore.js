(function () {
  "use strict";

  window.clWDUtil = window.clWDUtil || {
    pfGetTraitement: function () {
      return function () {};
    }
  };

  var API = "";

  /* ── Utilitaires ─────────────────────────────────────────────────────── */

  function get(url) {
    return fetch(API + url).then(function (r) { return r.json(); });
  }

  function post(url, data) {
    return fetch(API + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }).then(function (r) { return r.json(); });
  }

  function del(url) {
    return fetch(API + url, { method: "DELETE" }).then(function (r) { return r.json(); });
  }

  function currentPage() {
    var p = window.location.pathname;
    if (p === "/" || p.indexOf("index") !== -1) return "home";
    if (p.indexOf("Mon-panier") !== -1) return "cart";
    if (p.indexOf("Ajout-Produit") !== -1) return "add";
    if (p.indexOf("PI_Produit") !== -1) return "detail";
    if (p.indexOf("MABOUTIQUE") !== -1) return "boutique";
    return "other";
  }

  /* ── Carte livre (grille produits) ────────────────────────────────────── */

  function buildBookCard(book) {
    var card = document.createElement("div");
    card.style.cssText = "display:inline-block;width:190px;margin:8px;vertical-align:top;" +
      "background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.15);" +
      "cursor:pointer;transition:transform .2s;";
    card.setAttribute("data-id", book.id);

    card.innerHTML =
      '<img src="' + book.image + '" alt="' + esc(book.titre) + '" ' +
      'style="width:100%;height:180px;object-fit:cover;" ' +
      'onerror="this.src=\'https://via.placeholder.com/190x180?text=Livre\'">' +
      '<div style="padding:8px;">' +
      '<p style="margin:0 0 4px;font-family:\'Lucida Sans Unicode\',sans-serif;' +
      'font-size:.85rem;font-weight:bold;color:#2d2d2d;line-height:1.3;">' + esc(book.titre) + '</p>' +
      '<p style="margin:0 0 6px;font-size:.75rem;color:#808080;">' + esc(book.auteur) + '</p>' +
      '<p style="margin:0 0 8px;font-size:.7rem;color:#ff690c;font-weight:bold;">' +
      esc(book.genre) + '</p>' +
      '<p style="margin:0 0 8px;font-family:\'Trebuchet MS\',sans-serif;' +
      'font-size:.9rem;font-weight:bold;color:#202020;">' +
      book.prix.toLocaleString("fr-FR") + ' FCFA</p>' +
      '<button data-id="' + book.id + '" class="btn-panier" ' +
      'style="width:100%;padding:6px;background:#ff690c;color:#fff;border:none;' +
      'border-radius:20px;cursor:pointer;font-family:\'Trebuchet MS\',sans-serif;font-size:.8rem;">' +
      'Ajouter au panier</button>' +
      '</div>';

    card.querySelector(".btn-panier").addEventListener("click", function (e) {
      e.stopPropagation();
      var id = parseInt(this.getAttribute("data-id"));
      post("/api/cart/add", { id: id, qty: 1 }).then(function () {
        updateCartBadge();
        showToast("Livre ajouté au panier !");
      });
    });

    card.addEventListener("click", function () {
      window.location.href = "/PI_Produit.html?id=" + book.id;
    });

    card.addEventListener("mouseenter", function () {
      this.style.transform = "translateY(-3px)";
    });
    card.addEventListener("mouseleave", function () {
      this.style.transform = "";
    });

    return card;
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ── Badge panier ─────────────────────────────────────────────────────── */

  function updateCartBadge() {
    get("/api/cart").then(function (cart) {
      var total = cart.reduce(function (s, i) { return s + i.qty; }, 0);
      var badge = document.getElementById("lb-cart-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.id = "lb-cart-badge";
        badge.style.cssText =
          "background:#ff690c;color:#fff;border-radius:50%;padding:2px 6px;" +
          "font-size:.7rem;font-weight:bold;margin-left:4px;vertical-align:middle;";
        var cartLinks = document.querySelectorAll('a[href*="Mon-panier"]');
        if (cartLinks.length > 0) cartLinks[0].appendChild(badge);
      }
      badge.textContent = total > 0 ? total : "";
      badge.style.display = total > 0 ? "inline" : "none";
    });
  }

  /* ── Toast notification ───────────────────────────────────────────────── */

  function showToast(msg) {
    var t = document.getElementById("lb-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "lb-toast";
      t.style.cssText =
        "position:fixed;bottom:24px;right:24px;background:#202020;color:#fff;" +
        "padding:12px 20px;border-radius:8px;z-index:9999;font-family:'Trebuchet MS',sans-serif;" +
        "font-size:.9rem;opacity:0;transition:opacity .3s;pointer-events:none;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = "1";
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.style.opacity = "0"; }, 2500);
  }

  /* ── PAGE : Accueil ───────────────────────────────────────────────────── */

  function initHome() {
    var conA70 = document.getElementById("con-A70");
    var conA90 = document.getElementById("con-A90");
    var searchInput = document.getElementById("A7");

    function loadBooks(params) {
      get("/api/books" + (params || "")).then(function (books) {
        if (!conA70) return;
        conA70.innerHTML = "";
        if (books.length === 0) {
          conA70.innerHTML =
            '<p style="padding:24px;color:#808080;font-family:\'Trebuchet MS\',sans-serif;">' +
            'Aucun livre trouvé.</p>';
          return;
        }
        books.forEach(function (b) {
          conA70.appendChild(buildBookCard(b));
        });
      });
    }

    loadBooks();

    get("/api/books/featured").then(function (featured) {
      if (!conA90) return;
      conA90.innerHTML = "";
      featured.slice(0, 4).forEach(function (b) {
        var wrap = document.createElement("div");
        wrap.style.cssText =
          "display:inline-block;width:180px;height:140px;margin:6px;overflow:hidden;" +
          "border-radius:6px;cursor:pointer;";
        wrap.innerHTML =
          '<img src="' + b.image + '" alt="' + esc(b.titre) + '" ' +
          'style="width:100%;height:100%;object-fit:cover;" ' +
          'onerror="this.src=\'https://via.placeholder.com/180x140?text=' + encodeURIComponent(b.titre) + '\'">';
        wrap.addEventListener("click", function () {
          window.location.href = "/PI_Produit.html?id=" + b.id;
        });
        conA90.appendChild(wrap);
      });
    });

    if (searchInput) {
      if (searchInput.value === "Recherche d'article") searchInput.value = "";
      searchInput.placeholder = "Rechercher un livre, un auteur…";

      var debounce;
      searchInput.addEventListener("input", function () {
        clearTimeout(debounce);
        var q = this.value.trim();
        debounce = setTimeout(function () {
          loadBooks(q ? "?search=" + encodeURIComponent(q) : "");
        }, 350);
      });
    }

    var catLinks = document.querySelectorAll("#A20, #A21, #A22, #A23, #A24");
    var genreMap = {
      "A20": "Roman", "A21": "Développement", "A22": "Sciences",
      "A23": "Science-Fiction", "A24": "Jeunesse"
    };
    catLinks.forEach(function (el) {
      el.style.cursor = "pointer";
      el.addEventListener("click", function () {
        var genre = genreMap[this.id];
        if (genre) loadBooks("?genre=" + encodeURIComponent(genre));
        else loadBooks();
      });
    });

    updateCartBadge();
  }

  /* ── PAGE : Mon Panier ────────────────────────────────────────────────── */

  function initCart() {
    var container = document.getElementById("A2_HTE");
    var totalEl = document.getElementById("A19");

    function renderCart() {
      get("/api/cart").then(function (cart) {
        if (!container) return;
        container.innerHTML = "";

        if (cart.length === 0) {
          container.innerHTML =
            '<p style="padding:24px;color:#808080;font-family:\'Trebuchet MS\',sans-serif;">' +
            'Votre panier est vide.</p>';
          if (totalEl) totalEl.innerHTML = "<p>Total : 0 FCFA</p>";
          return;
        }

        var total = 0;
        cart.forEach(function (item) {
          total += item.prix * item.qty;
          var row = document.createElement("div");
          row.style.cssText =
            "display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid #e0e0e0;" +
            "background:#fff;";
          row.innerHTML =
            '<img src="' + item.image + '" style="width:70px;height:90px;object-fit:cover;border-radius:4px;" ' +
            'onerror="this.src=\'https://via.placeholder.com/70x90?text=Livre\'">' +
            '<div style="flex:1;">' +
            '<p style="margin:0 0 4px;font-weight:bold;font-family:\'Trebuchet MS\',sans-serif;">' +
            esc(item.titre) + '</p>' +
            '<p style="margin:0 0 4px;color:#808080;font-size:.85rem;">' + esc(item.auteur) + '</p>' +
            '<p style="margin:0;color:#ff690c;font-weight:bold;">' +
            (item.prix * item.qty).toLocaleString("fr-FR") + ' FCFA</p>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:8px;">' +
            '<span style="font-size:.85rem;color:#555;">Qté : ' + item.qty + '</span>' +
            '<button data-id="' + item.id + '" class="btn-remove" ' +
            'style="background:#e74c3c;color:#fff;border:none;border-radius:50%;' +
            'width:24px;height:24px;cursor:pointer;font-size:.8rem;line-height:24px;text-align:center;">✕</button>' +
            '</div>';
          row.querySelector(".btn-remove").addEventListener("click", function () {
            del("/api/cart/remove/" + this.getAttribute("data-id")).then(renderCart);
          });
          container.appendChild(row);
        });

        if (totalEl) {
          totalEl.innerHTML =
            '<p><span style="font-family:\'Times New Roman\',serif;">Total : </span>' +
            '<strong style="color:#ff690c;">' + total.toLocaleString("fr-FR") + ' FCFA</strong></p>';
        }
      });
    }

    renderCart();

    var clearBtn = document.getElementById("A57");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        del("/api/cart/clear").then(renderCart);
      });
    }
  }

  /* ── PAGE : Ajouter un Produit (Livre) ───────────────────────────────── */

  function initAdd() {
    var btnAdd = document.getElementById("A8");
    if (!btnAdd) return;

    var fieldTitre = document.getElementById("A5");
    var fieldAuteur = document.getElementById("A6");
    var fieldPrix = document.getElementById("A7");

    if (fieldTitre && fieldTitre.value === "Nom du produit") fieldTitre.value = "";
    if (fieldAuteur && fieldAuteur.value === "Désignation\u00a0") fieldAuteur.value = "";
    if (fieldPrix && fieldPrix.value === "Prix du produit") fieldPrix.value = "";

    if (fieldTitre) fieldTitre.placeholder = "Titre du livre";
    if (fieldAuteur) fieldAuteur.placeholder = "Auteur";
    if (fieldPrix) fieldPrix.placeholder = "Prix en FCFA";

    var genreInput = document.createElement("div");
    genreInput.style.cssText = "margin:8px 0;";
    genreInput.innerHTML =
      '<label style="font-family:Verdana,sans-serif;font-size:.8rem;color:#555;">Genre / Catégorie</label><br>' +
      '<select id="lb-genre" style="width:100%;padding:6px;margin-top:4px;' +
      'border:1px solid #ff690c;border-radius:6px;">' +
      '<option>Roman</option><option>Jeunesse</option><option>Sciences</option>' +
      '<option>Développement</option><option>Science-Fiction</option>' +
      '<option>Histoire</option><option>Art & Architecture</option></select>';
    if (btnAdd && btnAdd.parentNode) {
      btnAdd.parentNode.insertBefore(genreInput, btnAdd);
    }

    btnAdd.addEventListener("click", function () {
      var titre = (fieldTitre ? fieldTitre.value : "").trim();
      var auteur = (fieldAuteur ? fieldAuteur.value : "").trim();
      var prixStr = (fieldPrix ? fieldPrix.value : "").trim();
      var genre = (document.getElementById("lb-genre") ? document.getElementById("lb-genre").value : "Roman");
      var prix = parseInt(prixStr.replace(/\D/g, ""), 10);

      if (!titre || !auteur || isNaN(prix)) {
        showToast("Merci de remplir tous les champs.");
        return;
      }

      post("/api/books", { titre: titre, auteur: auteur, genre: genre, prix: prix }).then(function (res) {
        if (res.id) {
          showToast("Livre \"" + titre + "\" ajouté avec succès !");
          if (fieldTitre) fieldTitre.value = "";
          if (fieldAuteur) fieldAuteur.value = "";
          if (fieldPrix) fieldPrix.value = "";
        } else {
          showToast("Erreur : " + (res.error || "inconnue"));
        }
      });
    });
  }

  /* ── PAGE : Détail Livre ─────────────────────────────────────────────── */

  function initDetail() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    if (!id) return;

    get("/api/books/" + id).then(function (book) {
      if (book.error) return;

      var nameEl = document.getElementById("I2");
      var descEl = document.getElementById("I3");
      var imgEl = document.getElementById("I4");

      if (nameEl) nameEl.value = book.titre + " — " + book.auteur;
      if (descEl) descEl.value = book.description || book.genre;
      if (imgEl) {
        imgEl.src = book.image;
        imgEl.onerror = function () {
          this.src = "https://via.placeholder.com/99x66?text=Livre";
        };
      }

      var priceDiv = document.createElement("div");
      priceDiv.style.cssText =
        "margin:12px 8px;font-family:'Trebuchet MS',sans-serif;" +
        "font-size:1.1rem;font-weight:bold;color:#ff690c;";
      priceDiv.textContent = book.prix.toLocaleString("fr-FR") + " FCFA";

      var addBtn = document.createElement("button");
      addBtn.textContent = "Ajouter au panier";
      addBtn.style.cssText =
        "margin:8px;padding:8px 20px;background:#ff690c;color:#fff;" +
        "border:none;border-radius:20px;cursor:pointer;" +
        "font-family:'Trebuchet MS',sans-serif;font-size:.9rem;";
      addBtn.addEventListener("click", function () {
        post("/api/cart/add", { id: book.id, qty: 1 }).then(function () {
          updateCartBadge();
          showToast("Livre ajouté au panier !");
        });
      });

      var form = document.querySelector("form");
      if (form) {
        form.appendChild(priceDiv);
        form.appendChild(addBtn);
      }

      document.title = book.titre;
    });
  }

  /* ── PAGE : Ma Boutique ─────────────────────────────────────────────── */

  function initBoutique() {
    var container = document.querySelector("#page");
    if (!container) return;

    var section = document.createElement("div");
    section.style.cssText =
      "max-width:900px;margin:20px auto;padding:16px;" +
      "background:#fff;border-radius:8px;box-shadow:0 1px 4px rgba(0,0,0,.1);";
    section.innerHTML =
      '<h2 style="font-family:\'Trebuchet MS\',sans-serif;color:#555;margin-bottom:16px;">' +
      'Mes Livres</h2>' +
      '<div id="lb-boutique-list" style="display:flex;flex-wrap:wrap;gap:12px;"></div>';

    var insertAfter = document.querySelector("#A17") || container.firstChild;
    if (insertAfter && insertAfter.parentNode) {
      insertAfter.parentNode.insertBefore(section, insertAfter.nextSibling);
    } else {
      container.appendChild(section);
    }

    get("/api/books").then(function (books) {
      var list = document.getElementById("lb-boutique-list");
      if (!list) return;
      books.forEach(function (b) {
        var item = document.createElement("div");
        item.style.cssText =
          "width:160px;background:#f8f8f8;border-radius:6px;overflow:hidden;" +
          "border:1px solid #e0e0e0;position:relative;";
        item.innerHTML =
          '<img src="' + b.image + '" style="width:100%;height:130px;object-fit:cover;"' +
          'onerror="this.src=\'https://via.placeholder.com/160x130?text=Livre\'">' +
          '<div style="padding:6px;">' +
          '<p style="margin:0 0 2px;font-size:.8rem;font-weight:bold;color:#2d2d2d;">' +
          esc(b.titre) + '</p>' +
          '<p style="margin:0;font-size:.75rem;color:#ff690c;">' +
          b.prix.toLocaleString("fr-FR") + ' FCFA</p>' +
          '</div>' +
          '<button data-id="' + b.id + '" class="btn-del" ' +
          'style="position:absolute;top:4px;right:4px;background:rgba(231,76,60,.85);' +
          'color:#fff;border:none;border-radius:50%;width:22px;height:22px;' +
          'cursor:pointer;font-size:.75rem;line-height:22px;text-align:center;">✕</button>';
        item.querySelector(".btn-del").addEventListener("click", function () {
          if (confirm("Supprimer \"" + b.titre + "\" ?")) {
            del("/api/books/" + this.getAttribute("data-id")).then(function () {
              item.remove();
            });
          }
        });
        list.appendChild(item);
      });
    });
  }

  /* ── Initialisation ──────────────────────────────────────────────────── */

  function init() {
    var page = currentPage();
    if (page === "home") initHome();
    else if (page === "cart") initCart();
    else if (page === "add") initAdd();
    else if (page === "detail") initDetail();
    else if (page === "boutique") initBoutique();

    updateCartBadge();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
