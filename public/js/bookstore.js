(function () {
  "use strict";

  window.clWDUtil = window.clWDUtil || {
    pfGetTraitement: function () {
      return function () {};
    }
  };

  function api(url, options) {
    return fetch(url, options || {}).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) throw data;
        return data;
      });
    });
  }

  function get(url) { return api(url); }
  function post(url, data) {
    return api(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
  }
  function put(url, data) {
    return api(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data || {}) });
  }
  function del(url) { return api(url, { method: "DELETE" }); }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function money(value) {
    return Number(value || 0).toLocaleString("fr-FR") + " FCFA";
  }

  function pageName() {
    var p = window.location.pathname;
    if (p === "/" || p.indexOf("index") !== -1) return "home";
    if (p.indexOf("Mon-panier") !== -1) return "cart";
    if (p.indexOf("Ajout-Produit") !== -1) return "add";
    if (p.indexOf("PI_Produit") !== -1) return "detail";
    if (p.indexOf("MABOUTIQUE") !== -1) return "boutique";
    if (p.indexOf("Admin") !== -1 || p.indexOf("login") !== -1) return "admin";
    return "other";
  }

  function toast(message, type) {
    var box = document.getElementById("magma-toast");
    if (!box) {
      box = document.createElement("div");
      box.id = "magma-toast";
      box.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:999999;max-width:360px;padding:13px 16px;border-radius:14px;color:#fff;font-family:Arial,sans-serif;box-shadow:0 18px 45px rgba(0,0,0,.25);opacity:0;transform:translateY(8px);transition:.25s;";
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.style.background = type === "error" ? "#b42318" : "#1f7a4d";
    box.style.opacity = "1";
    box.style.transform = "translateY(0)";
    clearTimeout(box._timer);
    box._timer = setTimeout(function () {
      box.style.opacity = "0";
      box.style.transform = "translateY(8px)";
    }, 3500);
  }

  function addAdminLink() {
    if (document.getElementById("magma-admin-link")) return;
    var link = document.createElement("a");
    link.id = "magma-admin-link";
    link.href = "/Admin.html";
    link.textContent = "Admin";
    link.style.cssText = "position:fixed;right:18px;top:18px;z-index:99999;background:#2b293a;color:#fff;text-decoration:none;padding:9px 14px;border-radius:999px;font:700 13px Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.2);";
    document.body.appendChild(link);
  }

  function updateCartBadge() {
    get("/api/cart").then(function (cart) {
      var count = cart.reduce(function (sum, item) { return sum + Number(item.qty || 0); }, 0);
      var badge = document.getElementById("magma-cart-badge");
      if (!badge) {
        badge = document.createElement("a");
        badge.id = "magma-cart-badge";
        badge.href = "/Mon-panier.html";
        badge.style.cssText = "position:fixed;right:18px;top:62px;z-index:99999;background:#ff690c;color:#fff;text-decoration:none;padding:9px 14px;border-radius:999px;font:700 13px Arial,sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.2);";
        document.body.appendChild(badge);
      }
      badge.textContent = "Panier (" + count + ")";
    }).catch(function () {});
  }

  function bookCard(book) {
    var card = document.createElement("div");
    card.style.cssText = "display:inline-block;width:190px;margin:8px;vertical-align:top;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 6px 22px rgba(0,0,0,.14);font-family:Arial,sans-serif;";
    card.innerHTML =
      '<img src="' + esc(book.image || "") + '" alt="' + esc(book.titre) + '" style="width:100%;height:180px;object-fit:cover;background:#eee;" onerror="this.src=\'https://via.placeholder.com/190x180?text=Livre\'">' +
      '<div style="padding:10px;">' +
      '<strong style="display:block;color:#2b293a;font-size:14px;line-height:1.25;min-height:36px;">' + esc(book.titre) + '</strong>' +
      '<span style="display:block;color:#777;font-size:12px;margin:5px 0;">' + esc(book.auteur) + '</span>' +
      '<span style="display:block;color:#ff690c;font-size:12px;font-weight:700;">' + esc(book.genre) + '</span>' +
      '<strong style="display:block;margin:8px 0;color:#111;">' + money(book.prix) + '</strong>' +
      '<button type="button" data-id="' + book.id + '" style="width:100%;border:0;background:#ff690c;color:#fff;padding:8px 10px;border-radius:999px;cursor:pointer;font-weight:700;">Ajouter au panier</button>' +
      '</div>';
    card.querySelector("button").addEventListener("click", function () {
      post("/api/cart/add", { id: book.id, qty: 1 }).then(function () {
        updateCartBadge();
        toast("Livre ajouté au panier.");
      }).catch(function (error) { toast(error.error || "Ajout impossible.", "error"); });
    });
    card.addEventListener("dblclick", function () {
      window.location.href = "/PI_Produit.html?id=" + book.id;
    });
    return card;
  }

  function ensureCatalogContainer() {
    var container = document.getElementById("con-A70") || document.getElementById("magma-catalog");
    if (!container) {
      container = document.createElement("section");
      container.id = "magma-catalog";
      container.style.cssText = "max-width:1100px;margin:40px auto;padding:20px;background:rgba(255,255,255,.95);border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.12);";
      container.innerHTML = '<h2 style="font-family:Arial,sans-serif;color:#2b293a;margin:0 0 12px;">Catalogue</h2><div id="magma-catalog-tools"></div><div id="magma-book-list"></div>';
      document.body.appendChild(container);
    }
    return container;
  }

  function initHome() {
    var container = ensureCatalogContainer();

    var tools = document.getElementById("magma-catalog-tools");
    if (!tools) {
      tools = document.createElement("div");
      tools.id = "magma-catalog-tools";
      tools.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;padding:10px 8px 4px;box-sizing:border-box;width:100%;";
      container.insertBefore(tools, container.firstChild);
    }

    var list = document.getElementById("magma-book-list");
    if (!list) {
      list = document.createElement("div");
      list.id = "magma-book-list";
      list.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;padding:8px;box-sizing:border-box;width:100%;";
      container.appendChild(list);
    }

    tools.innerHTML = '<input id="magma-search" placeholder="Rechercher un livre ou auteur" style="flex:1;min-width:220px;padding:11px;border:1px solid #ddd;border-radius:12px;box-sizing:border-box;"> <select id="magma-genre" style="padding:11px;border:1px solid #ddd;border-radius:12px;"><option value="">Toutes les catégories</option></select>';

    function load() {
      var q = document.getElementById("magma-search").value.trim();
      var genre = document.getElementById("magma-genre").value;
      var params = [];
      if (q) params.push("search=" + encodeURIComponent(q));
      if (genre) params.push("genre=" + encodeURIComponent(genre));
      get("/api/books" + (params.length ? "?" + params.join("&") : "")).then(function (books) {
        list.innerHTML = "";
        if (!books.length) {
          list.innerHTML = '<p style="font-family:Arial,sans-serif;color:#777;">Aucun livre trouvé.</p>';
          return;
        }
        books.forEach(function (book) { list.appendChild(bookCard(book)); });
      });
    }

    get("/api/genres").then(function (genres) {
      var select = document.getElementById("magma-genre");
      genres.forEach(function (genre) {
        var option = document.createElement("option");
        option.value = genre;
        option.textContent = genre;
        select.appendChild(option);
      });
    });
    document.getElementById("magma-search").addEventListener("input", load);
    document.getElementById("magma-genre").addEventListener("change", load);
    load();
  }

  function initCart() {
    var container = document.getElementById("A2_HTE") || document.getElementById("magma-cart");
    if (!container) {
      container = document.createElement("section");
      container.id = "magma-cart";
      container.style.cssText = "max-width:980px;margin:80px auto 30px;padding:20px;background:#fff;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.12);font-family:Arial,sans-serif;";
      document.body.appendChild(container);
    }

    function render() {
      get("/api/cart").then(function (cart) {
        var total = cart.reduce(function (sum, item) { return sum + item.prix * item.qty; }, 0);
        container.innerHTML = '<h2>Mon panier</h2>';
        if (!cart.length) {
          container.innerHTML += '<p>Votre panier est vide.</p>';
          return;
        }
        cart.forEach(function (item) {
          var row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:12px;border-bottom:1px solid #eee;padding:12px 0;";
          row.innerHTML = '<img src="' + esc(item.image || "") + '" style="width:62px;height:82px;object-fit:cover;border-radius:8px;background:#eee;">' +
            '<div style="flex:1;"><strong>' + esc(item.titre) + '</strong><br><span style="color:#777;">' + esc(item.auteur) + '</span><br><span>' + money(item.prix) + ' x ' + item.qty + '</span></div>' +
            '<button type="button" data-id="' + item.id + '" style="border:0;background:#b42318;color:#fff;border-radius:999px;padding:8px 12px;cursor:pointer;">Supprimer</button>';
          row.querySelector("button").addEventListener("click", function () {
            del("/api/cart/remove/" + item.id).then(function () { updateCartBadge(); render(); });
          });
          container.appendChild(row);
        });
        container.innerHTML += '<h3>Total : ' + money(total) + '</h3><div id="magma-checkout"></div>';
        renderCheckout();
      });
    }

    function renderCheckout() {
      var checkout = document.getElementById("magma-checkout");
      get("/api/delivery-zones").then(function (zones) {
        checkout.innerHTML = '<h3>Passer commande</h3>' +
          '<p style="color:#7a271a;background:#fff2e8;border:1px solid #fed7aa;padding:10px;border-radius:10px;">Livraison uniquement : Potopoto la gare → Total vers Saint Exupérie, Présidence, OSH, CHU. Hors zone, achat impossible.</p>' +
          '<input id="co-name" placeholder="Nom complet" style="width:100%;padding:10px;margin:5px 0;box-sizing:border-box;">' +
          '<input id="co-email" placeholder="Email" type="email" style="width:100%;padding:10px;margin:5px 0;box-sizing:border-box;">' +
          '<input id="co-phone" placeholder="Téléphone" style="width:100%;padding:10px;margin:5px 0;box-sizing:border-box;">' +
          '<select id="co-zone" style="width:100%;padding:10px;margin:5px 0;box-sizing:border-box;"><option value="">Choisir la zone de livraison</option>' + zones.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join("") + '</select>' +
          '<textarea id="co-address" placeholder="Adresse précise / repère" style="width:100%;padding:10px;margin:5px 0;box-sizing:border-box;min-height:80px;"></textarea>' +
          '<button id="co-submit" type="button" style="background:#ff690c;color:#fff;border:0;border-radius:999px;padding:12px 18px;font-weight:700;cursor:pointer;">Valider la commande</button>' +
          '<div id="co-result" style="margin-top:12px;"></div>';
        document.getElementById("co-submit").addEventListener("click", function () {
          post("/api/orders", {
            customer_name: document.getElementById("co-name").value,
            customer_email: document.getElementById("co-email").value,
            customer_phone: document.getElementById("co-phone").value,
            delivery_zone: document.getElementById("co-zone").value,
            delivery_address: document.getElementById("co-address").value
          }).then(function (res) {
            updateCartBadge();
            document.getElementById("co-result").innerHTML = '<div style="background:#ecfdf3;border:1px solid #abefc6;padding:12px;border-radius:12px;color:#067647;">Commande validée #' + res.order.id + '. <a href="' + res.receipt_url + '">Télécharger le reçu PDF</a><br><button type="button" id="cancel-order" style="margin-top:8px;">Annuler dans les 5 minutes</button></div>';
            document.getElementById("cancel-order").addEventListener("click", function () {
              post("/api/orders/" + res.order.id + "/cancel", {}).then(function () {
                toast("Commande annulée.");
                render();
              }).catch(function (error) { toast(error.error || "Annulation impossible.", "error"); });
            });
          }).catch(function (error) { toast(error.error || "Commande impossible.", "error"); });
        });
      });
    }

    render();
  }

  function initDetail() {
    var params = new URLSearchParams(window.location.search);
    var id = params.get("id");
    if (!id) return;
    var section = document.createElement("section");
    section.id = "magma-detail-extra";
    section.style.cssText = "max-width:920px;margin:30px auto;padding:18px;background:#fff;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.12);font-family:Arial,sans-serif;";
    document.body.appendChild(section);
    get("/api/books/" + id).then(function (book) {
      section.innerHTML = '<h2>' + esc(book.titre) + '</h2><p><strong>' + esc(book.auteur) + '</strong> — ' + esc(book.genre) + '</p><p>' + esc(book.description || "") + '</p><p>' + esc(book.infos || "") + '</p><h3>' + money(book.prix) + '</h3><button id="detail-add" type="button" style="background:#ff690c;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-weight:700;cursor:pointer;">Ajouter au panier</button><hr><h3>Avis clients</h3><div id="review-list"></div><div><input id="review-name" placeholder="Votre nom" style="padding:9px;margin:4px;width:180px;"><select id="review-rating" style="padding:9px;margin:4px;"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select><input id="review-comment" placeholder="Votre commentaire" style="padding:9px;margin:4px;width:260px;"><button id="review-submit" type="button">Publier</button></div>';
      document.getElementById("detail-add").addEventListener("click", function () {
        post("/api/cart/add", { id: Number(id), qty: 1 }).then(function () { updateCartBadge(); toast("Livre ajouté au panier."); });
      });
      function loadReviews() {
        get("/api/books/" + id + "/reviews").then(function (reviews) {
          document.getElementById("review-list").innerHTML = reviews.length ? reviews.map(function (r) { return '<p><strong>' + esc(r.customer_name) + '</strong> — ' + '★'.repeat(r.rating) + '<br>' + esc(r.comment) + '</p>'; }).join("") : '<p>Aucun avis pour ce livre.</p>';
        });
      }
      document.getElementById("review-submit").addEventListener("click", function () {
        post("/api/reviews", { book_id: Number(id), customer_name: document.getElementById("review-name").value, rating: document.getElementById("review-rating").value, comment: document.getElementById("review-comment").value }).then(function () { toast("Avis publié."); loadReviews(); }).catch(function (error) { toast(error.error || "Avis impossible.", "error"); });
      });
      loadReviews();
    });
  }

  function initAdmin() {
    var host = document.getElementById("magma-admin-root");
    if (!host) {
      host = document.createElement("section");
      host.id = "magma-admin-root";
      host.style.cssText = "max-width:1100px;margin:90px auto 40px;padding:22px;background:#fff;border-radius:18px;box-shadow:0 18px 60px rgba(0,0,0,.12);font-family:Arial,sans-serif;";
      document.body.appendChild(host);
    }

    function loginForm(message) {
      host.innerHTML = '<h1>Admin</h1><p>Accès protégé pour gérer les livres et les publicités.</p>' + (message ? '<p style="color:#b42318;">' + esc(message) + '</p>' : '') + '<input id="admin-password" type="password" placeholder="Mot de passe admin" style="padding:12px;border:1px solid #ddd;border-radius:12px;min-width:260px;"> <button id="admin-login" type="button" style="background:#2b293a;color:#fff;border:0;border-radius:999px;padding:12px 18px;cursor:pointer;">Entrer</button>';
      document.getElementById("admin-login").addEventListener("click", function () {
        post("/api/admin/login", { password: document.getElementById("admin-password").value }).then(renderPanel).catch(function (error) { loginForm(error.error || "Accès refusé."); });
      });
    }

    function field(id, placeholder, type) {
      return '<input id="' + id + '" type="' + (type || "text") + '" placeholder="' + placeholder + '" style="width:100%;padding:10px;margin:5px 0;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;">';
    }

    function renderPanel() {
      host.innerHTML = '<h1>Admin</h1><button id="admin-logout" type="button">Déconnexion</button><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px;margin-top:18px;"><section><h2>Livre</h2><input type="hidden" id="book-id">' + field("book-title", "Titre") + field("book-author", "Auteur") + field("book-category", "Catégorie") + field("book-price", "Prix", "number") + field("book-image", "URL de l'image") + field("book-stock", "Stock", "number") + '<textarea id="book-description" placeholder="Description" style="width:100%;padding:10px;margin:5px 0;min-height:70px;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;"></textarea><textarea id="book-infos" placeholder="Infos supplémentaires" style="width:100%;padding:10px;margin:5px 0;min-height:60px;box-sizing:border-box;border:1px solid #ddd;border-radius:10px;"></textarea><label><input id="book-featured" type="checkbox"> En vedette</label><br><button id="book-save" type="button" style="margin-top:8px;background:#ff690c;color:#fff;border:0;border-radius:999px;padding:10px 16px;cursor:pointer;">Enregistrer</button><button id="book-reset" type="button">Nouveau</button></section><section><h2>Publicité</h2>' + field("ad-title", "Titre") + field("ad-message", "Message") + field("ad-link", "Lien optionnel") + '<button id="ad-save" type="button">Publier</button><div id="ad-list"></div></section></div><h2>Livres existants</h2><div id="admin-books"></div>';
      document.getElementById("admin-logout").addEventListener("click", function () { post("/api/admin/logout", {}).then(loginForm); });
      document.getElementById("book-reset").addEventListener("click", clearBookForm);
      document.getElementById("book-save").addEventListener("click", saveBook);
      document.getElementById("ad-save").addEventListener("click", saveAd);
      loadAdminBooks();
      loadAds();
    }

    function clearBookForm() {
      ["book-id", "book-title", "book-author", "book-category", "book-price", "book-image", "book-stock", "book-description", "book-infos"].forEach(function (id) { document.getElementById(id).value = ""; });
      document.getElementById("book-featured").checked = false;
    }

    function bookPayload() {
      return {
        titre: document.getElementById("book-title").value,
        auteur: document.getElementById("book-author").value,
        genre: document.getElementById("book-category").value,
        prix: document.getElementById("book-price").value,
        image: document.getElementById("book-image").value,
        stock: document.getElementById("book-stock").value || 10,
        description: document.getElementById("book-description").value,
        infos: document.getElementById("book-infos").value,
        featured: document.getElementById("book-featured").checked
      };
    }

    function saveBook() {
      var id = document.getElementById("book-id").value;
      var action = id ? put("/api/books/" + id, bookPayload()) : post("/api/books", bookPayload());
      action.then(function () { toast("Livre enregistré."); clearBookForm(); loadAdminBooks(); }).catch(function (error) { toast(error.error || "Erreur livre.", "error"); });
    }

    function loadAdminBooks() {
      get("/api/books").then(function (books) {
        var wrap = document.getElementById("admin-books");
        wrap.innerHTML = books.map(function (b) {
          return '<div style="display:flex;gap:10px;align-items:center;border-bottom:1px solid #eee;padding:10px 0;"><img src="' + esc(b.image || "") + '" style="width:46px;height:60px;object-fit:cover;background:#eee;"><div style="flex:1;"><strong>' + esc(b.titre) + '</strong><br><small>' + esc(b.auteur) + ' — ' + esc(b.genre) + ' — ' + money(b.prix) + '</small></div><button data-edit="' + b.id + '">Modifier</button><button data-del="' + b.id + '">Supprimer</button></div>';
        }).join("");
        wrap.querySelectorAll("[data-edit]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            var b = books.find(function (x) { return x.id == btn.getAttribute("data-edit"); });
            document.getElementById("book-id").value = b.id;
            document.getElementById("book-title").value = b.titre;
            document.getElementById("book-author").value = b.auteur;
            document.getElementById("book-category").value = b.genre;
            document.getElementById("book-price").value = b.prix;
            document.getElementById("book-image").value = b.image || "";
            document.getElementById("book-stock").value = b.stock;
            document.getElementById("book-description").value = b.description || "";
            document.getElementById("book-infos").value = b.infos || "";
            document.getElementById("book-featured").checked = !!b.featured;
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        });
        wrap.querySelectorAll("[data-del]").forEach(function (btn) {
          btn.addEventListener("click", function () {
            if (!confirm("Supprimer ce livre ?")) return;
            del("/api/books/" + btn.getAttribute("data-del")).then(function () { toast("Livre supprimé."); loadAdminBooks(); }).catch(function (error) { toast(error.error || "Suppression impossible.", "error"); });
          });
        });
      });
    }

    function saveAd() {
      post("/api/admin/ads", { title: document.getElementById("ad-title").value, message: document.getElementById("ad-message").value, link: document.getElementById("ad-link").value, active: true }).then(function () { toast("Publicité publiée."); document.getElementById("ad-title").value = ""; document.getElementById("ad-message").value = ""; document.getElementById("ad-link").value = ""; loadAds(); }).catch(function (error) { toast(error.error || "Publicité impossible.", "error"); });
    }

    function loadAds() {
      get("/api/admin/ads").then(function (ads) {
        var list = document.getElementById("ad-list");
        list.innerHTML = ads.map(function (ad) { return '<p><strong>' + esc(ad.title) + '</strong><br>' + esc(ad.message) + '<br><button data-ad-del="' + ad.id + '">Supprimer</button></p>'; }).join("");
        list.querySelectorAll("[data-ad-del]").forEach(function (btn) {
          btn.addEventListener("click", function () { del("/api/admin/ads/" + btn.getAttribute("data-ad-del")).then(loadAds); });
        });
      });
    }

    get("/api/admin/status").then(function (status) { status.authenticated ? renderPanel() : loginForm(); }).catch(loginForm);
  }

  function initLegacyAdd() {
    var btn = document.getElementById("A8");
    if (!btn) return;
    btn.addEventListener("click", function () {
      toast("L'ajout de livres se fait maintenant depuis l'onglet Admin protégé.", "error");
      window.location.href = "/Admin.html";
    });
  }

  function init() {
    addAdminLink();
    updateCartBadge();
    var page = pageName();
    if (page === "home") initHome();
    if (page === "cart") initCart();
    if (page === "detail") initDetail();
    if (page === "admin" || page === "boutique") initAdmin();
    if (page === "add") initLegacyAdd();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
