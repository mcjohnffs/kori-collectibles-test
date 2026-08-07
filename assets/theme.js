(() => {
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => [...root.querySelectorAll(sel)];

  const initDrawers = () => {
    const menu = qs('[data-drawer="menu"]');
    const openBtn = qs('[data-open-menu]');
    if (menu && openBtn) {
      const set = (open) => {
        menu.hidden = !open;
        openBtn.setAttribute('aria-expanded', String(open));
        document.documentElement.style.overflow = open ? 'hidden' : '';
      };
      openBtn.addEventListener('click', () => set(true));
      qsa('[data-close-menu]', menu).forEach((el) => el.addEventListener('click', () => set(false)));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !menu.hidden) set(false);
      });
    }

    const search = qs('[data-search-modal]');
    const searchOpen = qs('[data-open-search]');
    if (search && searchOpen) {
      const set = (open) => {
        search.hidden = !open;
        document.documentElement.style.overflow = open ? 'hidden' : '';
        if (open) {
          const input = qs('[data-predictive-input]', search) || qs('input[type="search"]', search);
          if (input) setTimeout(() => input.focus(), 10);
        } else {
          const results = qs('[data-predictive-results]', search);
          if (results) {
            results.hidden = true;
            results.innerHTML = '';
          }
        }
      };
      searchOpen.addEventListener('click', () => set(true));
      qsa('[data-close-search]', search).forEach((el) => el.addEventListener('click', () => set(false)));
      search.addEventListener('click', (e) => {
        if (e.target === search) set(false);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !search.hidden) set(false);
      });
    }

    const facets = qs('[data-facets]');
    const facetsOpen = qs('[data-open-facets]');
    if (facets && facetsOpen) {
      const activeBadge = facetsOpen.querySelector('.facet-group__count');
      facetsOpen.addEventListener('click', () => {
        const open = !facets.classList.contains('is-open');
        facets.classList.toggle('is-open', open);
        facetsOpen.setAttribute('aria-expanded', String(open));
        facetsOpen.textContent = open ? 'Hide filters' : 'Filters';
        if (!open && activeBadge) facetsOpen.appendChild(activeBadge);
      });
    }

    const sort = qs('[data-sort-by]');
    if (sort) {
      sort.addEventListener('change', () => {
        const url = new URL(window.location.href);
        url.searchParams.set('sort_by', sort.value);
        window.location.assign(url.toString());
      });
    }

    qsa('[data-facet-select]').forEach((select) => {
      select.addEventListener('change', () => {
        const form = select.form;
        if (!form) return;
        // Drop empty selects so "All" clears that filter group.
        qsa('select[data-facet-select]', form).forEach((field) => {
          if (!field.value) field.disabled = true;
        });
        form.requestSubmit ? form.requestSubmit() : form.submit();
      });
    });

    const tagSelect = qs('[data-tag-select]');
    if (tagSelect) {
      tagSelect.addEventListener('change', () => {
        const base = tagSelect.getAttribute('data-collection-url') || window.location.pathname;
        const option = tagSelect.options[tagSelect.selectedIndex];
        const tag = option && option.getAttribute('data-tag');
        if (!tagSelect.value || !tag) {
          window.location.assign(base);
          return;
        }
        window.location.assign(`${base}/${encodeURIComponent(tag)}`);
      });
    }
  };

  const formatMoney = (cents, format) => {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    const value = (Number(cents) || 0) / 100;
    const formatted = value.toLocaleString('en-GB', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const plain = String(format || '£{{amount}}').replace(/<[^>]*>/g, '');
    if (/\{\{\s*amount/.test(plain)) {
      return plain
        .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, formatted.replace('.', ','))
        .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/, String(Math.round(value)))
        .replace(/\{\{\s*amount_no_decimals\s*\}\}/, String(Math.round(value)))
        .replace(/\{\{\s*amount\s*\}\}/, formatted);
    }
    return `£${formatted}`;
  };

  // Predictive search returns decimal currency strings (e.g. "1400.00"), not cents.
  const formatSuggestMoney = (amount) => {
    const value = Number(amount);
    const safe = Number.isFinite(value) ? value : 0;
    try {
      return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: (window.Shopify && Shopify.currency && Shopify.currency.active) || 'GBP',
      }).format(safe);
    } catch (err) {
      return `£${safe.toFixed(2)}`;
    }
  };

  const escapeHtml = (str) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

  const initCartDrawer = () => {
    const drawer = qs('[data-cart-drawer]');
    if (!drawer) return;

    const moneyFormat = drawer.getAttribute('data-money-format') || '£{{amount}}';
    const emptyMessage =
      drawer.getAttribute('data-empty-message') || 'Your cart is empty.';
    const threshold = Number(drawer.getAttribute('data-free-shipping-threshold') || 0);
    const cartUrl = drawer.getAttribute('data-cart-url') || '/cart';
    const contents = qs('[data-cart-contents]', drawer);
    const footer = qs('[data-cart-footer]', drawer);

    let closeTimer = null;

    const setOpen = (open) => {
      const panel = qs('.cart-drawer__panel', drawer);
      qsa('[data-open-cart]').forEach((btn) => btn.setAttribute('aria-expanded', String(open)));
      document.documentElement.style.overflow = open ? 'hidden' : '';

      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }

      if (open) {
        drawer.classList.add('is-animating');
        drawer.hidden = false;
        // Two frames: first paint closed panel off-screen, then slide in.
        void drawer.offsetWidth;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drawer.classList.add('is-open');
          });
        });
        return;
      }

      const finishClose = () => {
        drawer.classList.remove('is-open', 'is-animating');
        drawer.hidden = true;
        if (panel) panel.removeEventListener('transitionend', onEnd);
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const onEnd = (e) => {
        if (e.target !== panel) return;
        if (e.propertyName !== 'transform') return;
        finishClose();
      };

      if (!drawer.classList.contains('is-open')) {
        finishClose();
        return;
      }

      drawer.classList.add('is-animating');
      drawer.classList.remove('is-open');
      if (!panel) {
        finishClose();
        return;
      }
      panel.addEventListener('transitionend', onEnd);
      closeTimer = setTimeout(finishClose, 360);
    };

    const updateCountBadge = (count) => {
      qsa('[data-cart-count]').forEach((badge) => {
        badge.textContent = String(count);
        badge.hidden = count <= 0;
      });
    };

    const renderShipping = (totalPrice) => {
      const el = qs('[data-cart-shipping]', drawer);
      if (!el || !threshold) return;
      if (totalPrice >= threshold) {
        el.textContent = "You've unlocked free UK delivery";
      } else {
        el.textContent = `Spend ${formatMoney(threshold - totalPrice, moneyFormat)} more for free UK delivery`;
      }
    };

    const renderLoyalty = (totalPrice) => {
      const loyalty = qs('[data-cart-loyalty]', drawer);
      if (!loyalty) return;
      const rate = Number(loyalty.dataset.pointsRate || 1);
      const earn = Math.floor((totalPrice * rate) / 100);
      const earnEl = qs('[data-cart-loyalty-earn]', loyalty);
      if (earnEl) earnEl.textContent = String(earn);
    };

    const itemImage = (item) => {
      const src =
        item.featured_image && item.featured_image.url
          ? item.featured_image.url
          : item.image;
      if (!src) return '';
      const url = src.startsWith('//') ? `https:${src}` : src;
      return `<img src="${escapeHtml(url)}" alt="" width="72" height="96" loading="lazy">`;
    };

    const renderCart = (cart) => {
      updateCountBadge(cart.item_count || 0);
      const subtotal = qs('[data-cart-subtotal]', drawer);
      if (subtotal) subtotal.textContent = formatMoney(cart.total_price, moneyFormat);
      renderShipping(cart.total_price || 0);
      renderLoyalty(cart.total_price || 0);

      if (!cart.item_count) {
        contents.innerHTML = `
          <div class="cart-drawer__empty">
            <p>${escapeHtml(emptyMessage)}</p>
            <button type="button" class="button" data-close-cart style="margin-top:1rem;">Continue shopping</button>
          </div>`;
        if (footer) footer.hidden = true;
        return;
      }

      if (footer) footer.hidden = false;
      contents.innerHTML = `<ul class="cart-drawer__items" role="list">${cart.items
        .map((item) => {
          const variant =
            item.variant_title && item.variant_title !== 'Default Title'
              ? `<div class="cart-drawer__meta">${escapeHtml(item.variant_title)}</div>`
              : '';
          return `
            <li class="cart-drawer__item" data-key="${escapeHtml(item.key)}">
              <a class="cart-drawer__media" href="${escapeHtml(item.url)}">${itemImage(item)}</a>
              <div class="cart-drawer__details">
                <a class="cart-drawer__name" href="${escapeHtml(item.url)}">${escapeHtml(item.product_title)}</a>
                ${variant}
                <div class="cart-drawer__meta">${formatMoney(item.original_price, moneyFormat)}</div>
                <div class="cart-drawer__row">
                  <div class="cart-drawer__qty">
                    <button type="button" data-cart-qty="-1" data-key="${escapeHtml(item.key)}" aria-label="Decrease quantity">-</button>
                    <input type="number" min="0" value="${item.quantity}" aria-label="Quantity" data-cart-qty-input data-key="${escapeHtml(item.key)}">
                    <button type="button" data-cart-qty="1" data-key="${escapeHtml(item.key)}" aria-label="Increase quantity">+</button>
                  </div>
                  <div class="cart-drawer__line mono">${formatMoney(item.final_line_price, moneyFormat)}</div>
                </div>
                <button type="button" class="cart-drawer__remove" data-cart-remove data-key="${escapeHtml(item.key)}">Remove</button>
              </div>
            </li>`;
        })
        .join('')}</ul>`;
    };

    const fetchCart = async () => {
      const res = await fetch(`${cartUrl}.js`, {
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('Cart fetch failed');
      return res.json();
    };

    const changeLine = async (key, quantity) => {
      drawer.classList.add('is-loading');
      try {
        const res = await fetch(`${cartUrl}/change.js`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: key, quantity }),
        });
        if (!res.ok) throw new Error('Cart update failed');
        const cart = await res.json();
        renderCart(cart);
      } finally {
        drawer.classList.remove('is-loading');
      }
    };

    const refresh = async () => {
      const cart = await fetchCart();
      renderCart(cart);
      return cart;
    };

    const openCart = () => {
      const menu = qs('[data-drawer="menu"]');
      if (menu && !menu.hidden) {
        menu.hidden = true;
        const menuBtn = qs('[data-open-menu]');
        if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
      }
      const account = qs('[data-account-drawer]');
      if (account && typeof account._closeAccountDrawer === 'function') {
        account._closeAccountDrawer();
      }
      setOpen(true);
      refresh().catch(() => {});
    };

    // Capture-phase delegation so the cart always opens even if other listeners fail.
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target instanceof Element ? e.target : e.target.parentElement;
        const opener = target && target.closest('[data-open-cart]');
        if (!opener) return;
        e.preventDefault();
        e.stopPropagation();
        openCart();
      },
      true
    );

    drawer.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : e.target.parentElement;
      if (!target) return;

      if (target.closest('[data-close-cart]')) {
        setOpen(false);
        return;
      }

      const remove = target.closest('[data-cart-remove]');
      if (remove) {
        changeLine(remove.getAttribute('data-key'), 0).catch(() => {});
        return;
      }

      const qtyBtn = target.closest('[data-cart-qty]');
      if (qtyBtn) {
        const key = qtyBtn.getAttribute('data-key');
        const delta = Number(qtyBtn.getAttribute('data-cart-qty'));
        const safeKey = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(key) : key.replace(/"/g, '\\"');
        const input = qs(`[data-cart-qty-input][data-key="${safeKey}"]`, drawer);
        const next = Math.max(0, Number((input && input.value) || 0) + delta);
        changeLine(key, next).catch(() => {});
      }
    });

    drawer.addEventListener('change', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const input = target && target.closest('[data-cart-qty-input]');
      if (!input) return;
      const qty = Math.max(0, Number(input.value) || 0);
      changeLine(input.getAttribute('data-key'), qty).catch(() => {});
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !drawer.hidden) setOpen(false);
    });

    // AJAX add-to-cart on product forms opens the drawer.
    qsa('form[action*="/cart/add"]').forEach((form) => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submit = form.querySelector('[type="submit"]');
        if (submit) submit.disabled = true;
        try {
          const res = await fetch(`${cartUrl}/add.js`, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: new FormData(form),
          });
          if (!res.ok) throw new Error('Add to cart failed');
          await refresh();
          setOpen(true);
        } catch (err) {
          form.submit();
        } finally {
          if (submit) submit.disabled = false;
        }
      });
    });

    window.KoriCart = { open: openCart, refresh, setOpen };
  };

  const initNavDropdowns = () => {
    const items = qsa('.nav-item');
    items.forEach((item) => {
      item.addEventListener('toggle', () => {
        if (!item.open) return;
        items.forEach((other) => {
          if (other !== item) other.open = false;
        });
      });
    });
    document.addEventListener('click', (e) => {
      items.forEach((item) => {
        if (item.open && !item.contains(e.target)) item.open = false;
      });
    });
  };

  const initHeroTilt = () => {
    const card = qs('[data-hero-card]');
    if (!card || card.dataset.heroTiltBound === 'true') return;
    card.dataset.heroTiltBound = 'true';

    const shine = qs('[data-hero-shine]', card);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const productUrl = () => card.getAttribute('data-hero-url');
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;

    const applyTilt = (clientX, clientY) => {
      if (reduceMotion) return;
      const r = card.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const y = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      card.style.transform = `rotateX(${(0.5 - y) * 24}deg) rotateY(${(x - 0.5) * 30}deg) scale(1.04)`;
      if (shine) {
        shine.style.opacity = '1';
        shine.style.background = `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.5), transparent 55%)`;
      }
    };

    const resetTilt = () => {
      card.style.transform = '';
      if (shine) shine.style.opacity = '';
      card.classList.remove('is-tilting');
    };

    // Desktop hover follow
    card.addEventListener('mousemove', (e) => {
      if (dragging) return;
      card.classList.add('is-tilting');
      applyTilt(e.clientX, e.clientY);
    });
    card.addEventListener('mouseleave', () => {
      if (!dragging) resetTilt();
    });

    // Touch / drag
    const onStart = (clientX, clientY) => {
      dragging = true;
      moved = false;
      startX = clientX;
      startY = clientY;
      card.classList.add('is-tilting');
      applyTilt(clientX, clientY);
    };

    const onMove = (clientX, clientY, evt) => {
      if (!dragging) return;
      if (Math.abs(clientX - startX) > 8 || Math.abs(clientY - startY) > 8) moved = true;
      if (evt) evt.preventDefault();
      applyTilt(clientX, clientY);
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      resetTilt();
      const url = productUrl();
      if (!moved && url) {
        window.location.assign(url);
      }
      moved = false;
    };

    card.addEventListener(
      'touchstart',
      (e) => {
        if (!e.touches[0]) return;
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      },
      { passive: true }
    );
    card.addEventListener(
      'touchmove',
      (e) => {
        if (!e.touches[0]) return;
        onMove(e.touches[0].clientX, e.touches[0].clientY, e);
      },
      { passive: false }
    );
    card.addEventListener('touchend', onEnd);
    card.addEventListener('touchcancel', () => {
      dragging = false;
      resetTilt();
      moved = false;
    });

    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      onMove(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', onEnd);

    card.addEventListener('keydown', (e) => {
      const url = productUrl();
      if (!url) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.assign(url);
      }
    });
  };

  const initPredictiveSearch = () => {
    const forms = qsa('[data-predictive-search]');
    if (!forms.length) return;

    forms.forEach((form) => {
      const input = qs('[data-predictive-input]', form);
      const root = form.closest('.search-modal__box') || form.parentElement || document;
      const results = qs('[data-predictive-results]', root);
      if (!input || !results) return;

      const suggestUrl = form.getAttribute('data-suggest-url') || '/search/suggest';
      const searchUrl = form.getAttribute('data-search-url') || '/search';
      let timer = null;
      let controller = null;
      let lastQuery = '';

      const renderEmpty = (message) => {
        results.hidden = false;
        results.innerHTML = `<p class="predictive__status">${escapeHtml(message)}</p>`;
      };

      const renderProducts = (products, query) => {
        if (!products.length) {
          renderEmpty(`No matches for “${query}”`);
          return;
        }

        const items = products
          .map((product) => {
            const image =
              product.image ||
              (product.featured_image && (product.featured_image.url || product.featured_image)) ||
              '';
            const priceValue =
              product.price_min != null && product.price_min !== ''
                ? product.price_min
                : product.price;
            const price = formatSuggestMoney(priceValue);
            const vendor = product.vendor
              ? `<div class="predictive__meta">${escapeHtml(product.vendor)}</div>`
              : '';
            const media = image
              ? `<div class="predictive__media"><img src="${escapeHtml(image)}" alt="" width="48" height="48" loading="lazy"></div>`
              : `<div class="predictive__media"></div>`;

            return `
              <a class="predictive__item" href="${escapeHtml(product.url)}" role="option">
                ${media}
                <div class="predictive__copy">
                  <div class="predictive__title">${escapeHtml(product.title)}</div>
                  ${vendor}
                </div>
                <div class="predictive__price">${escapeHtml(price)}</div>
              </a>
            `;
          })
          .join('');

        results.hidden = false;
        results.innerHTML = `
          <div class="predictive__list" role="presentation">${items}</div>
          <div class="predictive__footer">
            <span>${products.length} suggestion${products.length === 1 ? '' : 's'}</span>
            <a href="${escapeHtml(searchUrl)}?type=product&options[prefix]=last&options[unavailable_products]=last&q=${encodeURIComponent(query)}">View all results</a>
          </div>
        `;
      };

      const fetchSuggestions = async (query) => {
        if (controller) controller.abort();
        controller = new AbortController();

        results.hidden = false;
        results.innerHTML = `<p class="predictive__status">Searching…</p>`;

        try {
          const jsonUrl = `${suggestUrl}.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=8&resources[options][unavailable_products]=last`;
          const res = await fetch(jsonUrl, {
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          if (!res.ok) throw new Error(`Suggest failed: ${res.status}`);
          const data = await res.json();
          const products =
            (data.resources && data.resources.results && data.resources.results.products) || [];
          if (query !== lastQuery) return;
          renderProducts(products, query);
        } catch (err) {
          if (err.name === 'AbortError') return;
          renderEmpty('Could not load suggestions. Press Search to continue.');
        }
      };

      const onInput = () => {
        const query = input.value.trim();
        lastQuery = query;
        clearTimeout(timer);

        if (query.length < 2) {
          results.hidden = true;
          results.innerHTML = '';
          return;
        }

        timer = setTimeout(() => fetchSuggestions(query), 180);
      };

      input.addEventListener('input', onInput);
      input.addEventListener('search', onInput);
    });
  };

  const initSearchPageFallback = () => {
    const grid = qs('[data-search-grid]');
    if (!grid) return;

    const query = (grid.getAttribute('data-query') || '').trim();
    const resultCount = Number(grid.getAttribute('data-result-count') || 0);
    if (!query || resultCount > 0) return;

    const suggestUrl = grid.getAttribute('data-suggest-url') || '/search/suggest';
    const summary = qs('[data-search-summary]');
    const empty = qs('[data-search-empty]');

    const renderFallbackCards = (products) => {
      if (!products.length) {
        if (summary) summary.textContent = `No results for “${query}”`;
        if (empty) empty.hidden = false;
        return;
      }

      if (summary) {
        summary.textContent = `${products.length} result${products.length === 1 ? '' : 's'} for “${query}”`;
      }
      if (empty) empty.hidden = true;

      grid.innerHTML = products
        .map((product) => {
          const image =
            product.image ||
            (product.featured_image && (product.featured_image.url || product.featured_image)) ||
            '';
          const media = image
            ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(product.title)}" loading="lazy">`
            : '';
          return `
            <a class="card" href="${escapeHtml(product.url)}">
              <div class="card__media">${media}</div>
              <div class="card__body">
                <div class="card__title">${escapeHtml(product.title)}</div>
                <div class="card__footer">
                  <span class="card__price">${escapeHtml(formatSuggestMoney(product.price))}</span>
                </div>
              </div>
            </a>
          `;
        })
        .join('');
    };

    (async () => {
      try {
        const jsonUrl = `${suggestUrl}.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=24&resources[options][unavailable_products]=last`;
        const res = await fetch(jsonUrl, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`Suggest failed: ${res.status}`);
        const data = await res.json();
        const products =
          (data.resources && data.resources.results && data.resources.results.products) || [];
        renderFallbackCards(products);
      } catch (err) {
        if (summary) summary.textContent = `No results for “${query}”`;
        if (empty) empty.hidden = false;
      }
    })();
  };

  const initProductForm = () => {
    const form = qs('.product-form');
    if (!form) return;

    const variantsEl = qs('[data-product-variants]', form);
    const inventoryEl = qs('[data-product-inventory]', form);
    const priceEl = qs('[data-product-price]');
    const stockEl = qs('[data-product-stock]');
    const submit = qs('[data-product-submit]', form);
    const pills = qsa('.product-form__pill-input', form);
    if (!variantsEl) return;

    const addToCartEl = qs('[data-add-to-cart]', form);
    const soldOutEl = qs('[data-sold-out]', form);
    const addToCartLabel = addToCartEl ? addToCartEl.textContent.trim() : 'Add to cart';
    const soldOutLabel = soldOutEl ? soldOutEl.textContent.trim() : 'Sold out';

    let variants = [];
    let inventory = {};
    try {
      variants = JSON.parse(variantsEl.textContent);
    } catch (err) {
      return;
    }
    if (inventoryEl) {
      try {
        inventory = JSON.parse(inventoryEl.textContent);
      } catch (err) {
        inventory = {};
      }
    }

    const formatVariantPrice = (cents) => {
      const moneyFormat = (window.Shopify && Shopify.money_format) || '£{{amount}}';
      return formatMoney(cents, moneyFormat);
    };

    const updateStock = (variantId) => {
      if (!stockEl) return;
      const info = inventory[String(variantId)];
      if (!info || !info.tracked) {
        stockEl.hidden = true;
        return;
      }

      const qty = info.qty || 0;
      stockEl.hidden = false;
      stockEl.textContent = info.available
        ? qty === 1
          ? '1 in stock'
          : `${qty} in stock`
        : 'Out of stock';
      stockEl.classList.toggle('is-low', info.available && qty > 0 && qty <= 3);
    };

    const updateVariant = (variantId) => {
      const variant = variants.find((item) => String(item.id) === String(variantId));
      if (!variant) return;

      qsa('.product-form__pill', form).forEach((pill) => {
        const input = qs('input', pill);
        pill.classList.toggle('is-selected', input && input.checked);
      });

      if (priceEl) {
        priceEl.textContent = formatVariantPrice(variant.price);
      }

      if (submit) {
        submit.disabled = !variant.available;
        submit.textContent = variant.available ? addToCartLabel : soldOutLabel;
      }

      updateStock(variantId);
    };

    if (pills.length) {
      pills.forEach((input) => {
        input.addEventListener('change', () => {
          if (input.checked) updateVariant(input.value);
        });
      });
    }
  };

  const initAnnouncementMarquee = () => {
    const tracks = qsa('.announcement__track');
    if (!tracks.length) return;

    const setup = (track) => {
      const seed = track.querySelector('.announcement__inner');
      if (!seed) return;

      const template = seed.cloneNode(true);
      track.replaceChildren(template);

      let guard = 0;
      while (track.scrollWidth < window.innerWidth && guard < 50) {
        const clone = template.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
        guard++;
      }

      const loopWidth = track.scrollWidth;
      [...track.children].forEach((child) => {
        const clone = child.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      });

      const duration = Math.max(16, loopWidth / 60);
      track.style.setProperty('--announcement-distance', `-${loopWidth}px`);
      track.style.setProperty('--announcement-duration', `${duration}s`);
      track.classList.add('is-ready');
    };

    tracks.forEach(setup);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        tracks.forEach((track) => {
          track.classList.remove('is-ready');
          track.style.removeProperty('--announcement-distance');
          track.style.removeProperty('--announcement-duration');
          setup(track);
        });
      }, 200);
    });
  };

  const initMoreTcgsExpand = () => {
    qsa('[data-more-tcgs]').forEach((group) => {
      const toggle = qs('[data-more-tcgs-toggle]', group);
      const panel = qs('[data-more-tcgs-panel]', group);
      if (!toggle || !panel) return;

      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open));
        panel.hidden = open;
        group.classList.toggle('is-open', !open);
      });
    });
  };

  const initAccountDrawer = () => {
    const drawer = qs('[data-account-drawer]');
    if (!drawer) return;

    const panel = qs('.account-drawer__panel', drawer);
    let closeTimer = null;

    const setOpen = (open) => {
      qsa('[data-open-account]').forEach((btn) => btn.setAttribute('aria-expanded', String(open)));
      document.documentElement.style.overflow = open ? 'hidden' : '';

      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }

      if (open) {
        const menu = qs('[data-drawer="menu"]');
        if (menu && !menu.hidden) {
          menu.hidden = true;
          const menuBtn = qs('[data-open-menu]');
          if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
        }
        const cart = qs('[data-cart-drawer]');
        if (cart && cart.classList.contains('is-open')) {
          cart.classList.remove('is-open', 'is-animating');
          cart.hidden = true;
          qsa('[data-open-cart]').forEach((btn) => btn.setAttribute('aria-expanded', 'false'));
        }

        drawer.classList.add('is-animating');
        drawer.hidden = false;
        void drawer.offsetWidth;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            drawer.classList.add('is-open');
          });
        });
        return;
      }

      const finishClose = () => {
        drawer.classList.remove('is-open', 'is-animating');
        drawer.hidden = true;
        if (panel) panel.removeEventListener('transitionend', onEnd);
        if (closeTimer) {
          clearTimeout(closeTimer);
          closeTimer = null;
        }
      };
      const onEnd = (e) => {
        if (e.target !== panel) return;
        if (e.propertyName !== 'transform') return;
        finishClose();
      };

      if (!drawer.classList.contains('is-open')) {
        finishClose();
        return;
      }

      drawer.classList.add('is-animating');
      drawer.classList.remove('is-open');
      if (!panel) {
        finishClose();
        return;
      }
      panel.addEventListener('transitionend', onEnd);
      closeTimer = setTimeout(finishClose, 360);
    };

    drawer._closeAccountDrawer = () => setOpen(false);

    document.addEventListener(
      'click',
      (e) => {
        const target = e.target instanceof Element ? e.target : e.target.parentElement;
        const opener = target && target.closest('[data-open-account]');
        if (!opener) return;
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      },
      true
    );

    drawer.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : e.target.parentElement;
      if (target && target.closest('[data-close-account]')) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) setOpen(false);
    });
  };

  const initLoyaltyPanel = () => {
    const widget = qs('[data-loyalty-widget]');
    const modal = widget ? qs('[data-loyalty-modal]', widget) : null;
    const panel = widget ? qs('[data-loyalty-panel]', widget) : null;
    const rewardsUrl = document.body.dataset.rewardsUrl || '/pages/rewards';
    let open = false;

    const setOpen = (next) => {
      if (!widget || !modal) return;
      open = next;
      widget.classList.toggle('is-open', open);
      modal.hidden = !open;
      document.documentElement.style.overflow = open ? 'hidden' : '';
      qsa('[data-open-loyalty-panel]').forEach((btn) => {
        btn.setAttribute('aria-expanded', String(open));
      });
      if (open && panel) {
        const focusable = qs('[data-close-loyalty-panel]', panel);
        if (focusable) focusable.focus();
      }
    };

    const openFromTrigger = (btn) => {
      const accountDrawer = qs('[data-account-drawer]');
      if (accountDrawer && typeof accountDrawer._closeAccountDrawer === 'function') {
        accountDrawer._closeAccountDrawer();
      }

      if (widget && modal) {
        setOpen(!open);
        return;
      }

      const targetUrl = btn instanceof Element ? btn.getAttribute('data-rewards-url') || rewardsUrl : rewardsUrl;
      window.location.assign(targetUrl);
    };

    qsa('[data-open-loyalty-panel]').forEach((btn) => {
      btn.addEventListener(
        'click',
        (e) => {
          e.preventDefault();
          openFromTrigger(btn);
        },
        true
      );
    });

    qsa('[data-close-loyalty-panel]').forEach((btn) => {
      btn.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    });
  };

  const initLoyaltyRedeem = () => {
    const updateLoyaltyBalance = (balance) => {
      if (balance === undefined || balance === null) return;
      qsa('[data-loyalty-balance]').forEach((el) => {
        el.textContent = String(balance);
      });
      document.body.dataset.loyaltyBalance = String(balance);
    };

    const revealModalActiveCode = (code) => {
      const section = qs('[data-loyalty-modal-codes]');
      if (!section) return;

      section.hidden = false;
      const codeEl = qs('[data-loyalty-modal-code]', section);
      if (codeEl) codeEl.textContent = code;

      const applyBtn = qs('[data-loyalty-modal-apply]', section);
      if (applyBtn) applyBtn.href = `/discount/${encodeURIComponent(code)}`;

      const copied = qs('[data-loyalty-modal-copied]', section);
      if (copied) copied.hidden = true;
    };

    const revealActiveCode = (code) => {
      const applyUrl = `/discount/${encodeURIComponent(code)}`;
      let section = qs('[data-loyalty-active-codes]');

      if (section) {
        section.removeAttribute('data-loyalty-active-codes-empty');
        const placeholder = qs('[data-loyalty-active-codes-placeholder]', section);
        const list = qs('.rewards__codes-list', section);

        if (placeholder && !list) {
          const redeemValue = section.dataset.redeemValue || '5';
          placeholder.outerHTML = `
            <div class="rewards__codes-list">
              <article class="rewards__code-card" data-loyalty-code-card>
                <div class="rewards__code-card-main">
                  <p class="rewards__code-label">Discount code</p>
                  <p class="rewards__code-value" data-loyalty-active-code>${code}</p>
                  <p class="rewards__code-meta">£${redeemValue} off · single use · does not expire</p>
                </div>
                <div class="rewards__code-actions">
                  <a class="button button--full" href="${applyUrl}" data-loyalty-active-apply>Apply to cart</a>
                  <button type="button" class="button button--secondary button--full" data-loyalty-active-copy>Copy code</button>
                </div>
                <p class="rewards__code-invalid" data-loyalty-code-invalid hidden role="status">
                  This code has already been used or is no longer valid.
                </p>
              </article>
            </div>`;
        } else {
          const codeEl = qs('[data-loyalty-active-code]', section);
          const applyBtn = qs('[data-loyalty-active-apply]', section);
          if (codeEl) codeEl.textContent = code;
          if (applyBtn) applyBtn.href = applyUrl;
        }
      } else {
        const panel = qs('.rewards__redeem-panel');
        if (panel) {
          section = document.createElement('section');
          section.className = 'rewards__codes';
          section.dataset.loyaltyActiveCodes = '';
          section.innerHTML = `
            <h2 class="rewards__codes-title">Your active rewards</h2>
            <div class="rewards__codes-list">
              <article class="rewards__code-card" data-loyalty-code-card>
                <div class="rewards__code-card-main">
                  <p class="rewards__code-label">Discount code</p>
                  <p class="rewards__code-value" data-loyalty-active-code></p>
                  <p class="rewards__code-meta">Single use · does not expire</p>
                </div>
                <div class="rewards__code-actions">
                  <a class="button button--full" href="#" data-loyalty-active-apply>Apply to cart</a>
                  <button type="button" class="button button--secondary button--full" data-loyalty-active-copy>Copy code</button>
                </div>
                <p class="rewards__code-invalid" data-loyalty-code-invalid hidden role="status">
                  This code has already been used or is no longer valid.
                </p>
              </article>
            </div>`;
          panel.insertAdjacentElement('afterend', section);
          const codeEl = qs('[data-loyalty-active-code]', section);
          const applyBtn = qs('[data-loyalty-active-apply]', section);
          if (codeEl) codeEl.textContent = code;
          if (applyBtn) applyBtn.href = applyUrl;
        }
      }

      qsa('[data-loyalty-redeem]').forEach((root) => {
        root.dataset.activeCode = code;
        if (root.dataset.activeCodeDisplay === 'below') {
          const ready = qs('[data-loyalty-redeem-ready]', root);
          const hasCode = qs('[data-loyalty-redeem-has-code]', root);
          if (ready) ready.hidden = true;
          if (!hasCode) {
            const hint = document.createElement('p');
            hint.className = 'loyalty-redeem__hint';
            hint.dataset.loyaltyRedeemHasCode = '';
            hint.textContent = 'Your active discount code is shown below.';
            root.appendChild(hint);
          }
        }
      });

      revealModalActiveCode(code);
    };

    document.addEventListener('click', async (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const copyBtn = target.closest('[data-loyalty-modal-copy]');
      if (!copyBtn) return;

      const section = copyBtn.closest('[data-loyalty-modal-codes]');
      const codeEl = section ? qs('[data-loyalty-modal-code]', section) : null;
      const code = codeEl ? (codeEl.textContent || '').trim() : '';
      if (!code) return;

      e.preventDefault();
      try {
        await navigator.clipboard.writeText(code);
        const copied = section ? qs('[data-loyalty-modal-copied]', section) : null;
        if (copied) copied.hidden = false;
      } catch {
        // ignore
      }
    });

    const showCode = (root, payload) => {
      const displayMode = root.dataset.activeCodeDisplay || 'inline';

      if (displayMode === 'below') {
        revealActiveCode(payload.code);
        const loadingEl = qs('[data-loyalty-redeem-loading]', root);
        const errorEl = qs('[data-loyalty-redeem-error]', root);
        if (loadingEl) loadingEl.hidden = true;
        if (errorEl) errorEl.hidden = true;
        return;
      }

      const ready = qs('[data-loyalty-redeem-ready]', root);
      const success = qs('[data-loyalty-redeem-success]', root);
      const codeEl = qs('[data-loyalty-redeem-code]', root);
      const applyBtn = qs('[data-loyalty-redeem-apply]', root);
      const errorEl = qs('[data-loyalty-redeem-error]', root);
      const loadingEl = qs('[data-loyalty-redeem-loading]', root);

      if (loadingEl) loadingEl.hidden = true;
      if (errorEl) errorEl.hidden = true;
      if (ready) ready.hidden = true;
      if (success) success.hidden = false;
      if (codeEl) codeEl.textContent = payload.code;
      if (applyBtn) applyBtn.href = payload.applyUrl || `/discount/${encodeURIComponent(payload.code)}`;
      root.dataset.activeCode = payload.code;

      if (payload.balance !== undefined) {
        updateLoyaltyBalance(payload.balance);
      }
    };

    const isDiscountCodeValid = async (code) => {
      try {
        const response = await fetch(`/discount/${encodeURIComponent(code)}`, {
          credentials: 'same-origin',
          redirect: 'manual',
        });
        return response.type === 'opaqueredirect' || response.status === 302 || response.status === 303;
      } catch {
        return true;
      }
    };

    const validateActiveCodes = async () => {
      await Promise.all(
        qsa('[data-loyalty-code-card]').map(async (card) => {
          const codeEl = qs('[data-loyalty-active-code]', card);
          const invalidEl = qs('[data-loyalty-code-invalid]', card);
          const actions = qs('.rewards__code-actions', card);
          const code = codeEl?.textContent?.trim();
          if (!code) return;

          const valid = await isDiscountCodeValid(code);
          if (valid) return;

          if (actions) actions.hidden = true;
          if (invalidEl) invalidEl.hidden = false;
          card.classList.add('rewards__code-card--invalid');
        })
      );
    };

    const setRedeemModalOpen = (modal, open, formTrigger) => {
      if (!modal) return;
      modal.hidden = !open;
      modal.classList.toggle('is-open', open);
      document.documentElement.style.overflow = open ? 'hidden' : '';
      if (open) {
        const closeBtn = qs('[data-loyalty-redeem-modal-close]', modal);
        if (closeBtn instanceof HTMLElement) closeBtn.focus();
      } else if (formTrigger instanceof HTMLElement) {
        formTrigger.focus();
      }
    };

    const pollForRedeemCode = (root) => {
      const ready = qs('[data-loyalty-redeem-ready]', root);
      const errorEl = qs('[data-loyalty-redeem-error]', root);
      const loadingEl = qs('[data-loyalty-redeem-loading]', root);

      if (loadingEl) loadingEl.hidden = false;
      if (errorEl) errorEl.hidden = true;
      if (ready) ready.hidden = true;

      let attempts = 0;
      const maxAttempts = 20;

      const finishWaiting = (message) => {
        if (loadingEl) loadingEl.hidden = true;
        if (ready) ready.hidden = false;
        if (errorEl && message) {
          errorEl.textContent = message;
          errorEl.hidden = false;
        }
      };

      const check = async () => {
        attempts += 1;
        try {
          const url = new URL(window.location.href);
          url.searchParams.set('loyalty_poll', String(Date.now()));
          const response = await fetch(url.toString(), {
            credentials: 'same-origin',
            headers: { Accept: 'text/html' },
          });
          if (!response.ok) throw new Error('poll failed');
          const html = await response.text();
          const doc = new DOMParser().parseFromString(html, 'text/html');
          const codeFromSection = doc.querySelector('[data-loyalty-active-code]')?.textContent?.trim();
          const codeFromCard = doc.querySelector('[data-loyalty-redeem]')?.dataset?.activeCode?.trim();
          const code = codeFromSection || codeFromCard;
          if (code) {
            revealActiveCode(code);
            const modal = qs('[data-loyalty-redeem-modal]', root);
            setRedeemModalOpen(modal, false, qs('[data-loyalty-redeem-form-trigger]', root));
            const loadingEl = qs('[data-loyalty-redeem-loading]', root);
            if (loadingEl) loadingEl.hidden = true;
            return;
          }
        } catch {
          // keep polling
        }

        if (attempts < maxAttempts) {
          window.setTimeout(check, 3000);
          return;
        }

        finishWaiting('Your code is still being created. Refresh this page in a moment.');
      };

      window.setTimeout(check, 3000);
    };

    const watchShopifyFormSubmit = (root, onSubmit) => {
      const slot = document.getElementById('loyalty-redeem-form');
      if (!slot) return;

      let watching = false;

      const bindEmbed = (embed) => {
        if (!embed?.shadowRoot || watching) return false;
        const appEmbed = embed.shadowRoot.querySelector('#app-embed');
        const form = embed.shadowRoot.querySelector('form');
        if (!appEmbed && !form) return false;

        watching = true;
        let triggered = false;
        const fire = () => {
          if (triggered) return;
          triggered = true;
          onSubmit();
        };

        if (form) {
          form.addEventListener('submit', () => window.setTimeout(fire, 400), { once: true });
        }

        if (appEmbed) {
          const observer = new MutationObserver(() => {
            const step = appEmbed.getAttribute('data-current-step');
            if (!step || step === 'form' || step === 'idle') return;
            fire();
          });
          observer.observe(appEmbed, { attributes: true, attributeFilter: ['data-current-step'] });
        }

        return true;
      };

      if (!bindEmbed(slot.querySelector('form-embed'))) {
        const slotObserver = new MutationObserver(() => {
          if (bindEmbed(slot.querySelector('form-embed'))) slotObserver.disconnect();
        });
        slotObserver.observe(slot, { childList: true, subtree: true });
      }
    };

    qsa('[data-loyalty-redeem]').forEach((root) => {
      const method = root.dataset.redeemMethod || 'flow';
      const proxyUrl = root.dataset.proxyUrl;
      const fallbackEmail = root.dataset.fallbackEmail;
      const redeemPoints = root.dataset.redeemPoints || '100';
      const activeCode = root.dataset.activeCode;

      if (activeCode && !qs('[data-loyalty-redeem-code]', root)?.textContent?.trim()) {
        showCode(root, {
          code: activeCode,
          applyUrl: `/discount/${encodeURIComponent(activeCode)}`,
        });
      }

      const trigger = qs('[data-loyalty-redeem-trigger]', root);
      const formTrigger = qs('[data-loyalty-redeem-form-trigger]', root);
      const copyBtn = qs('[data-loyalty-redeem-copy]', root);
      const errorEl = qs('[data-loyalty-redeem-error]', root);
      const loadingEl = qs('[data-loyalty-redeem-loading]', root);

      if (formTrigger) {
        const modal = qs('[data-loyalty-redeem-modal]', root);
        formTrigger.addEventListener('click', () => setRedeemModalOpen(modal, true, formTrigger));

        if (modal) {
          qsa('[data-loyalty-redeem-modal-close]', modal).forEach((btn) => {
            btn.addEventListener('click', () => setRedeemModalOpen(modal, false, formTrigger));
          });

          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) setRedeemModalOpen(modal, false, formTrigger);
          });
        }
      }

      if (method === 'flow' && !activeCode) {
        watchShopifyFormSubmit(root, () => pollForRedeemCode(root));
      }

      if (trigger && proxyUrl && method === 'proxy') {
        trigger.addEventListener('click', async () => {
          if (loadingEl) loadingEl.hidden = false;
          if (errorEl) errorEl.hidden = true;
          trigger.disabled = true;

          try {
            const response = await fetch(proxyUrl, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { Accept: 'application/json' },
            });
            const payload = await response.json();

            if (!response.ok) {
              throw new Error(payload.error || 'Could not redeem points right now.');
            }

            showCode(root, payload);
          } catch (err) {
            if (loadingEl) loadingEl.hidden = true;
            if (errorEl) {
              const message = err instanceof Error ? err.message : 'Redemption failed.';
              if (fallbackEmail) {
                const subject = encodeURIComponent(`Redeem ${redeemPoints} loyalty points`);
                const body = encodeURIComponent('Hi, I would like to redeem my loyalty points please.');
                errorEl.innerHTML = `${message} <a href="mailto:${fallbackEmail}?subject=${subject}&body=${body}">Email us instead</a>.`;
              } else {
                errorEl.textContent = message;
              }
              errorEl.hidden = false;
            }
            trigger.disabled = false;
          }
        });
      }

      if (copyBtn) {
        copyBtn.addEventListener('click', async () => {
          const codeEl = qs('[data-loyalty-redeem-code]', root);
          const code = codeEl ? codeEl.textContent.trim() : '';
          if (!code) return;
          try {
            await navigator.clipboard.writeText(code);
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
              copyBtn.textContent = 'Copy code';
            }, 2000);
          } catch {
            copyBtn.textContent = 'Copy failed';
          }
        });
      }
    });

    qsa('[data-loyalty-active-copy]').forEach((copyBtn) => {
      copyBtn.addEventListener('click', async () => {
        const card = copyBtn.closest('[data-loyalty-code-card]');
        const codeEl = card ? qs('[data-loyalty-active-code]', card) : null;
        const code = codeEl ? codeEl.textContent.trim() : '';
        if (!code) return;
        try {
          await navigator.clipboard.writeText(code);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy code';
          }, 2000);
        } catch {
          copyBtn.textContent = 'Copy failed';
        }
      });
    });

    validateActiveCodes();
  };

  const initLoyaltyBalanceSync = () => {
    const raw = document.body.dataset.loyaltyBalance;
    if (raw === undefined || raw === '') return;

    const layoutBalance = Number(raw);
    if (Number.isNaN(layoutBalance)) return;

    qsa('[data-loyalty-balance]').forEach((el) => {
      const current = el.textContent.trim();
      if (current === '' || current === '0') {
        el.textContent = String(layoutBalance);
      }
    });
  };

  const initProductCards = () => {
    const moneyFormat = (window.Shopify && Shopify.money_format) || '£{{amount}}';

    const selectVariant = (card, pill) => {
      if (!card || !pill || pill.disabled) return;
      const priceEl = qs('[data-card-price]', card);
      const addBtn = qs('[data-card-add]', card);
      const cents = Number(pill.dataset.variantPrice || 0);
      const available = pill.dataset.variantAvailable === 'true';
      const variantId = pill.dataset.variantId;

      qsa('[data-card-variant]', card).forEach((btn) => {
        const selected = btn === pill;
        btn.classList.toggle('is-selected', selected);
        btn.setAttribute('aria-pressed', String(selected));
      });

      if (priceEl) priceEl.textContent = formatMoney(cents, moneyFormat);
      if (addBtn) {
        addBtn.dataset.variantId = variantId || '';
        addBtn.disabled = !available;
        addBtn.textContent = available ? 'Add to basket' : 'Sold out';
      }
    };

    const addToCart = async (card, addBtn) => {
      const variantId = addBtn.dataset.variantId;
      if (!variantId || addBtn.disabled) return;

      addBtn.classList.add('is-loading');
      addBtn.disabled = true;
      const previousLabel = addBtn.textContent;
      addBtn.textContent = 'Adding…';

      try {
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: Number(variantId), quantity: 1 }),
        });
        if (!res.ok) throw new Error('Add to cart failed');

        if (window.KoriCart && typeof window.KoriCart.refresh === 'function') {
          await window.KoriCart.refresh();
          window.KoriCart.open();
        } else {
          window.location.assign('/cart');
        }
        addBtn.textContent = 'Added';
        setTimeout(() => {
          addBtn.textContent = previousLabel || 'Add to basket';
        }, 1200);
      } catch {
        addBtn.textContent = previousLabel || 'Add to basket';
        window.location.assign(`/cart/add?id=${encodeURIComponent(variantId)}&quantity=1`);
      } finally {
        addBtn.classList.remove('is-loading');
        const selected = qs('[data-card-variant].is-selected', card) || qs('[data-card-variant]', card);
        const available = selected
          ? selected.dataset.variantAvailable === 'true'
          : addBtn.dataset.variantId !== '';
        addBtn.disabled = !available;
      }
    };

    document.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const pill = target.closest('[data-card-variant]');
      if (pill) {
        e.preventDefault();
        e.stopPropagation();
        selectVariant(pill.closest('[data-product-card]'), pill);
        return;
      }

      const addBtn = target.closest('[data-card-add]');
      if (addBtn) {
        e.preventDefault();
        e.stopPropagation();
        addToCart(addBtn.closest('[data-product-card]'), addBtn);
      }
    });
  };

  const initTcgSetTileHeights = () => {
    const grids = Array.from(document.querySelectorAll('.tcg-landing__sets'));
    if (!grids.length) return;

    const measure = (grid) => {
      const medias = Array.from(grid.querySelectorAll('.tcg-landing__set-media'));
      if (!medias.length) return;

      grid.style.removeProperty('--tcg-set-media-h');

      let maxH = 0;
      medias.forEach((media) => {
        const img = media.querySelector('img');
        const style = window.getComputedStyle(media);
        const padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        const padY = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
        const contentW = Math.max(0, media.clientWidth - padX);

        if (img && img.naturalWidth > 0 && contentW > 0) {
          const renderedH = (img.naturalHeight / img.naturalWidth) * contentW;
          maxH = Math.max(maxH, renderedH + padY);
          return;
        }

        maxH = Math.max(maxH, media.offsetHeight);
      });

      if (maxH > 0) {
        grid.style.setProperty('--tcg-set-media-h', `${Math.ceil(maxH)}px`);
      }
    };

    const syncAll = () => grids.forEach(measure);

    grids.forEach((grid) => {
      grid.querySelectorAll('img').forEach((img) => {
        if (!img.complete) {
          img.addEventListener('load', syncAll, { once: true });
        }
      });
    });

    syncAll();
    window.addEventListener('resize', syncAll);
  };

  const boot = () => {
    try {
      initLoyaltyRedeem();
    } catch (err) {
      console.error('initLoyaltyRedeem failed', err);
    }
    try {
      initLoyaltyBalanceSync();
    } catch (err) {
      console.error('initLoyaltyBalanceSync failed', err);
    }
    try {
      initAnnouncementMarquee();
    } catch (err) {
      console.error('initAnnouncementMarquee failed', err);
    }
    try {
      initAccountDrawer();
    } catch (err) {
      console.error('initAccountDrawer failed', err);
    }
    try {
      initLoyaltyPanel();
    } catch (err) {
      console.error('initLoyaltyPanel failed', err);
    }
    try {
      initMoreTcgsExpand();
    } catch (err) {
      console.error('initMoreTcgsExpand failed', err);
    }
    try {
      initTcgSetTileHeights();
    } catch (err) {
      console.error('initTcgSetTileHeights failed', err);
    }
    try {
      initDrawers();
    } catch (err) {
      console.error('initDrawers failed', err);
    }
    try {
      initCartDrawer();
    } catch (err) {
      console.error('initCartDrawer failed', err);
    }
    try {
      initNavDropdowns();
      initHeroTilt();
      initPredictiveSearch();
      initSearchPageFallback();
      initProductForm();
      initProductCards();
    } catch (err) {
      console.error('theme boot extras failed', err);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();


// Styles
const styles = `
  .image-zoom-container {
    position: relative;
    overflow: hidden;
  }
  .zoom-toggle-icon {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 40px;
    height: 40px;
    background: rgba(255,255,255,0.85);
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2;
    backdrop-filter: blur(4px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    font-size: 18px;
    transition: background 0.2s;
    touch-action: manipulation;
  }
  .zoom-toggle-icon:hover {
    background: rgba(255,255,255,1);
  }
  .zoom-toggle-icon.zoomed {
    background: rgba(0,0,0,0.7);
    color: white;
  }
  .image-zoom-container img {
    /* Smooth zoom & pan transitions can be added if desired */
    /* transition: transform 0.2s ease; */ 
  }
`;

// Styles
const styles = `
  .image-zoom-container {
    position: relative;
    overflow: hidden;
    cursor: zoom-in;  /* shows magnifying glass when not zoomed */
  }
  .image-zoom-container.zoomed {
    cursor: zoom-out;
  }
`;

const styleSheet = document.createElement("style");
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

function initImageZoom() {
  const DRAG_SENSITIVITY = 0.6; // Tune this (0.4–0.8)

  document.querySelectorAll('.card__media img, .product__media img').forEach(img => {
    const container = img.parentElement;
    container.classList.add('image-zoom-container');

    let zoomed = false;
    let totalTranslateX = 0;
    let totalTranslateY = 0;
    let startPointerX = 0;
    let startPointerY = 0;
    let baseTranslateX = 0;
    let baseTranslateY = 0;

    const handlePointerDown = (e) => {
      if (!zoomed) return;
      // For mouse, require left button
      if (e.pointerType === 'mouse' && e.buttons !== 1) return;
      e.preventDefault();
      startPointerX = e.clientX;
      startPointerY = e.clientY;
      baseTranslateX = totalTranslateX;
      baseTranslateY = totalTranslateY;
      container.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
      if (!zoomed) return;
      e.preventDefault();
      const deltaX = e.clientX - startPointerX;
      const deltaY = e.clientY - startPointerY;
      totalTranslateX = baseTranslateX + deltaX * DRAG_SENSITIVITY;
      totalTranslateY = baseTranslateY + deltaY * DRAG_SENSITIVITY;
      img.style.transform = `scale(2) translate(${totalTranslateX}px, ${totalTranslateY}px)`;
    };

    const handlePointerUp = (e) => {
      if (!zoomed) return;
      const deltaX = e.clientX - startPointerX;
      const deltaY = e.clientY - startPointerY;
      totalTranslateX = baseTranslateX + deltaX * DRAG_SENSITIVITY;
      totalTranslateY = baseTranslateY + deltaY * DRAG_SENSITIVITY;
      container.releasePointerCapture(e.pointerId);
    };

    const toggleZoom = (e) => {
      // Stop any propagation if needed, but don't prevent default here
      if (!zoomed) {
        // ZOOM IN – use click/tap coordinates, or center
        const rect = container.getBoundingClientRect();
        const clientX = e.clientX || rect.left + rect.width/2;
        const clientY = e.clientY || rect.top + rect.height/2;
        const x = ((clientX - rect.left) / rect.width) * 100;
        const y = ((clientY - rect.top) / rect.height) * 100;

        img.style.transformOrigin = `${x}% ${y}%`;
        totalTranslateX = 0;
        totalTranslateY = 0;
        img.style.transform = 'scale(2) translate(0px, 0px)';

        container.classList.add('zoomed');
        container.style.touchAction = 'none';

        container.addEventListener('pointerdown', handlePointerDown);
        container.addEventListener('pointermove', handlePointerMove);
        container.addEventListener('pointerup', handlePointerUp);
        container.addEventListener('pointercancel', handlePointerUp);

        zoomed = true;
      } else {
        // ZOOM OUT
        img.style.transform = 'scale(1) translate(0px, 0px)';
        img.style.transformOrigin = 'center';

        container.classList.remove('zoomed');
        container.style.touchAction = '';

        container.removeEventListener('pointerdown', handlePointerDown);
        container.removeEventListener('pointermove', handlePointerMove);
        container.removeEventListener('pointerup', handlePointerUp);
        container.removeEventListener('pointercancel', handlePointerUp);

        zoomed = false;
      }
    };

    // Toggle zoom on click/tap anywhere inside the container
    container.addEventListener('click', toggleZoom);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initImageZoom);
} else {
  initImageZoom();
}