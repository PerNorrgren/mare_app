(function () {
  let products = [];
  let cart = []; // { productId, name, priceCents, currency, qty, variant }
  let currentProduct = null;
  let currentFrameUrls = []; // resolved playback URLs for the open product's 360 frames
  let currentFrameIndex = 0;

  const CART_STORAGE_KEY = 'mare-shop-cart';

  function t(key, fallback, vars) {
    if (window.MareI18n && window.MareI18n.ready) {
      const val = window.MareI18n.t(key, vars);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatPrice(cents, currency) {
    try {
      return new Intl.NumberFormat(window.MareI18n && window.MareI18n.locale === 'nl' ? 'nl-NL' : 'en-GB', {
        style: 'currency', currency: (currency || 'gbp').toUpperCase(),
      }).format((cents || 0) / 100);
    } catch {
      return `${(cents / 100).toFixed(2)} ${(currency || '').toUpperCase()}`;
    }
  }

  // ── Cart persistence — sessionStorage, not localStorage: a cart is a
  // "right now, this visit" thing, not something that should silently
  // reappear weeks later with stale prices. ──
  function loadCart() {
    try {
      const raw = sessionStorage.getItem(CART_STORAGE_KEY);
      cart = raw ? JSON.parse(raw) : [];
    } catch { cart = []; }
  }
  function saveCart() {
    try { sessionStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart)); } catch { /* storage unavailable — cart still works for this page view */ }
  }
  function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    document.getElementById('cart-count').textContent = String(count);
  }

  // ── Product grid ──
  async function loadProducts() {
    const grid = document.getElementById('shop-grid');
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      products = data.products || [];
      if (!products.length) {
        grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('shopEmpty', 'Nothing in the shop yet — check back soon.'))}</p>`;
        return;
      }
      grid.innerHTML = products.map(p => `
        <button type="button" class="shop-product-card" data-product-id="${escapeHtml(p.id)}">
          <span class="shop-product-image" style="background-image:url('/images/mare-front-cover.jpg')" data-image-key="${escapeHtml(p.image_key || '')}"></span>
          <span class="shop-product-name">${escapeHtml(p.name)}</span>
          <span class="shop-product-price">${escapeHtml(formatPrice(p.price_cents, p.currency))}</span>
        </button>
      `).join('');
      // Resolve real cover images from R2 in the background — the grid
      // is usable immediately with a placeholder rather than blocking
      // render on N playback-url round trips.
      grid.querySelectorAll('[data-image-key]').forEach(async (el) => {
        const key = el.getAttribute('data-image-key');
        if (!key) return;
        try {
          const res = await fetch(`/api/playback-url?key=${encodeURIComponent(key)}`);
          const data = await res.json();
          if (data.url) el.style.backgroundImage = `url('${data.url}')`;
        } catch { /* placeholder stands */ }
      });
      grid.querySelectorAll('.shop-product-card').forEach(card => {
        card.addEventListener('click', () => openProductDetail(card.getAttribute('data-product-id')));
      });
    } catch {
      grid.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('shopCouldNotLoad', "Couldn't load the shop right now."))}</p>`;
    }
  }

  // ── Product detail + 360 viewer ──
  async function openProductDetail(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    currentProduct = product;
    currentFrameIndex = 0;

    document.getElementById('pd-name').textContent = product.name;
    document.getElementById('pd-price').textContent = formatPrice(product.price_cents, product.currency);
    document.getElementById('pd-desc').textContent = product.description || '';
    document.getElementById('pd-qty').value = 1;

    // Variants
    const variantOptions = product.variant_options || {};
    const variantKeys = Object.keys(variantOptions);
    const variantField = document.getElementById('pd-variant-field');
    if (variantKeys.length) {
      const key = variantKeys[0]; // single variant dimension (e.g. size) — matches the admin's own simple {key: [values]} shape
      const values = variantOptions[key] || [];
      document.getElementById('pd-variant-label').textContent = key.charAt(0).toUpperCase() + key.slice(1);
      document.getElementById('pd-variant').innerHTML = values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
      variantField.hidden = false;
    } else {
      variantField.hidden = true;
    }

    // Resolve every 360-frame image up front, so dragging swaps a
    // locally-cached <img src> instantly rather than firing a network
    // request per frame — the whole point of a spin viewer is that it
    // feels immediate under the finger.
    const frameKeys = (product.image_keys && product.image_keys.length) ? product.image_keys : (product.image_key ? [product.image_key] : []);
    document.getElementById('pd-spin-image').src = '/images/mare-front-cover.jpg'; // placeholder while resolving
    currentFrameUrls = await Promise.all(frameKeys.map(async (key) => {
      try {
        const res = await fetch(`/api/playback-url?key=${encodeURIComponent(key)}`);
        const data = await res.json();
        return data.url || null;
      } catch { return null; }
    }));
    currentFrameUrls = currentFrameUrls.filter(Boolean);
    if (currentFrameUrls.length) document.getElementById('pd-spin-image').src = currentFrameUrls[0];
    document.getElementById('pd-spin-hint').hidden = currentFrameUrls.length <= 1;

    // Video tab
    const mediaTabs = document.getElementById('pd-media-tabs');
    const video = document.getElementById('pd-video');
    const spinViewer = document.getElementById('pd-spin-viewer');
    if (product.video_key) {
      mediaTabs.hidden = false;
      video.hidden = true;
      spinViewer.hidden = false;
      mediaTabs.querySelectorAll('.shop-media-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.media === 'photos'));
      // Resolve lazily — only when the Video tab is actually clicked,
      // not up front, since most visitors will only look at photos.
      video.dataset.key = product.video_key;
      video.removeAttribute('src');
    } else {
      mediaTabs.hidden = true;
      video.hidden = true;
      spinViewer.hidden = false;
    }

    document.getElementById('product-detail-modal').hidden = false;
  }

  function setupMediaTabs() {
    document.getElementById('pd-media-tabs').addEventListener('click', async (e) => {
      const btn = e.target.closest('.shop-media-tab');
      if (!btn) return;
      document.querySelectorAll('.shop-media-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const video = document.getElementById('pd-video');
      const spinViewer = document.getElementById('pd-spin-viewer');
      if (btn.dataset.media === 'video') {
        spinViewer.hidden = true;
        video.hidden = false;
        if (!video.src && video.dataset.key) {
          try {
            const res = await fetch(`/api/playback-url?key=${encodeURIComponent(video.dataset.key)}`);
            const data = await res.json();
            if (data.url) video.src = data.url;
          } catch { /* video stays empty — no crash */ }
        }
      } else {
        video.pause();
        video.hidden = true;
        spinViewer.hidden = false;
      }
    });
  }

  // ── 360 spin drag interaction ──
  function setupSpinViewer() {
    const viewer = document.getElementById('pd-spin-viewer');
    const img = document.getElementById('pd-spin-image');
    let dragging = false;
    let startX = 0;
    let startFrame = 0;
    const PIXELS_PER_FRAME = 12; // drag distance to advance one frame — tuned for a natural feel, not physically meaningful

    function setFrame(index) {
      if (!currentFrameUrls.length) return;
      const wrapped = ((index % currentFrameUrls.length) + currentFrameUrls.length) % currentFrameUrls.length;
      currentFrameIndex = wrapped;
      img.src = currentFrameUrls[wrapped];
    }

    function onDown(clientX) {
      if (currentFrameUrls.length <= 1) return;
      dragging = true;
      startX = clientX;
      startFrame = currentFrameIndex;
      document.getElementById('pd-spin-hint').style.opacity = '0';
    }
    function onMove(clientX) {
      if (!dragging) return;
      const delta = clientX - startX;
      setFrame(startFrame + Math.round(delta / PIXELS_PER_FRAME));
    }
    function onUp() { dragging = false; }

    viewer.addEventListener('pointerdown', (e) => { onDown(e.clientX); viewer.setPointerCapture(e.pointerId); });
    viewer.addEventListener('pointermove', (e) => onMove(e.clientX));
    viewer.addEventListener('pointerup', onUp);
    viewer.addEventListener('pointercancel', onUp);
  }

  // ── Add to cart ──
  function setupProductDetailActions() {
    document.getElementById('pd-close-btn').addEventListener('click', () => {
      document.getElementById('product-detail-modal').hidden = true;
      document.getElementById('pd-video').pause();
    });
    document.getElementById('pd-add-btn').addEventListener('click', () => {
      if (!currentProduct) return;
      const qty = Math.max(1, parseInt(document.getElementById('pd-qty').value, 10) || 1);
      const variantField = document.getElementById('pd-variant-field');
      const variant = variantField.hidden ? null : document.getElementById('pd-variant').value;
      const existing = cart.find(item => item.productId === currentProduct.id && item.variant === variant);
      if (existing) {
        existing.qty += qty;
      } else {
        cart.push({
          productId: currentProduct.id, name: currentProduct.name,
          priceCents: currentProduct.price_cents, currency: currentProduct.currency,
          qty, variant,
        });
      }
      saveCart();
      updateCartCount();
      document.getElementById('product-detail-modal').hidden = true;
      document.getElementById('pd-video').pause();
    });
    document.getElementById('pd-ask-mare-btn').addEventListener('click', () => {
      if (!currentProduct) return;
      if (window.MareHelperAPI) window.MareHelperAPI.openForProduct(currentProduct.id);
    });
  }

  // ── Cart modal ──
  function renderCart() {
    const container = document.getElementById('cart-items');
    if (!cart.length) {
      container.innerHTML = `<p class="admin-empty-note">${escapeHtml(t('shopCartEmpty', 'Your cart is empty.'))}</p>`;
    } else {
      container.innerHTML = cart.map((item, i) => `
        <div class="shop-cart-row">
          <div class="shop-cart-row-main">
            <div class="shop-cart-row-name">${escapeHtml(item.name)}${item.variant ? ` · ${escapeHtml(item.variant)}` : ''}</div>
            <div class="shop-cart-row-sub">${escapeHtml(formatPrice(item.priceCents, item.currency))} × ${item.qty}</div>
          </div>
          <button type="button" class="btn-ghost btn-small" data-remove-idx="${i}">${escapeHtml(t('adminDelete', 'Remove'))}</button>
        </div>
      `).join('');
      container.querySelectorAll('[data-remove-idx]').forEach(btn => {
        btn.addEventListener('click', () => {
          cart.splice(Number(btn.getAttribute('data-remove-idx')), 1);
          saveCart();
          updateCartCount();
          renderCart();
        });
      });
    }
    const totalCents = cart.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    document.getElementById('cart-total').textContent = cart.length
      ? t('shopCartTotal', 'Total: {amount}', { amount: formatPrice(totalCents, cart[0]?.currency || 'gbp') })
      : '';
  }

  function setupCart() {
    document.getElementById('cart-btn').addEventListener('click', () => {
      renderCart();
      document.getElementById('cart-error').hidden = true;
      document.getElementById('cart-modal').hidden = false;
    });
    document.getElementById('cart-close-btn').addEventListener('click', () => {
      document.getElementById('cart-modal').hidden = true;
    });
    document.getElementById('cart-checkout-btn').addEventListener('click', async () => {
      const errorEl = document.getElementById('cart-error');
      errorEl.hidden = true;
      if (!cart.length) { errorEl.textContent = t('shopCartEmpty', 'Your cart is empty.'); errorEl.hidden = false; return; }

      // Checkout requires a signed-in parent — check session first
      // rather than letting the request 401 and showing a raw error.
      let sessionOk = false;
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          sessionOk = data.user && data.user.role === 'parent';
        }
      } catch { /* treat as not signed in */ }

      if (!sessionOk) {
        document.getElementById('cart-modal').hidden = true;
        document.getElementById('login-prompt').hidden = false;
        return;
      }

      const btn = document.getElementById('cart-checkout-btn');
      btn.disabled = true;
      try {
        const offerCode = document.getElementById('cart-offer-code').value.trim();
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.map(item => ({ productId: item.productId, qty: item.qty, variant: item.variant })),
            offerCode: offerCode || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || t('errorGeneric', 'Something went wrong.'));
        // Cart is intentionally cleared before redirecting — the order
        // was already created server-side at this point, so leaving
        // stale items in the cart for a "successful" checkout would be
        // wrong even though the person is about to leave the page.
        cart = [];
        saveCart();
        window.location.href = data.url;
      } catch (err) {
        errorEl.textContent = err.message;
        errorEl.hidden = false;
      } finally {
        btn.disabled = false;
      }
    });
  }

  function setupLoginPrompt() {
    document.getElementById('close-login-prompt').addEventListener('click', () => {
      document.getElementById('login-prompt').hidden = true;
    });
  }

  function setupLangSwitch() {
    document.querySelectorAll('#lang-switch .lang-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang');
      btn.classList.toggle('active', lang === window.MareI18n.locale);
      btn.addEventListener('click', () => window.MareI18n.switchLocale(lang));
    });
  }

  async function init() {
    await window.MareI18n.ready;
    setupLangSwitch();
    loadCart();
    updateCartCount();
    setupMediaTabs();
    setupSpinViewer();
    setupProductDetailActions();
    setupCart();
    setupLoginPrompt();
    await loadProducts();
  }

  init();
})();
