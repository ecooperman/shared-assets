// Shared DOM/UI helpers for every app under evancooperman.com, exposed as
// window.Theme so plain <script> includes work with no build step (matches
// the house no-build-step convention). Pairs with theme.css's component
// classes (.page-message, .item-card/.item-summary/.item-details, ...) -
// see README.md for the full picture.
//
// Deliberately NOT here: fetch/API helpers (API_BASE etc.) and anything
// domain-specific (date formatting, Google Maps deep-linking, ...) - those
// differ per app and stay in each app's own static/*.js.

(function () {
  // Generic DOM-builder helper - identical to the one duplicated in every
  // app's app.js/common.js.
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
      else if (value !== null && value !== undefined) node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) {
      if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  }

  // Toast/feedback bar helper. Looks up an element by id (default
  // "page-message", matching theme.css's .page-message) unless an element
  // is passed directly. `kind` is "success" or "error"; auto-hides after
  // 4s the same way every app's local copy of this already did.
  function showMessage(text, kind, target = "page-message") {
    const el = typeof target === "string" ? document.getElementById(target) : target;
    if (!el) return;
    el.textContent = text;
    el.className = "page-message " + kind;
    clearTimeout(showMessage._timers?.get(el));
    (showMessage._timers ||= new WeakMap()).set(
      el,
      setTimeout(() => el.classList.add("hidden"), 4000)
    );
  }

  // Wires the expand/collapse behavior for one accordion card (theme.css's
  // .item-card/.item-summary/.item-details). Call this once per card, right
  // after building its summary/details elements - the same place every
  // app's card-builder currently has its own copy of this toggle() closure.
  // Keyboard-operable (Enter/Space) when `summary` carries role="button" and
  // tabindex="0"; a no-op on keydown otherwise.
  function wireAccordionToggle(card, summary, details) {
    function toggle() {
      const isExpanded = card.classList.toggle("expanded");
      details.classList.toggle("hidden", !isExpanded);
      summary.setAttribute("aria-expanded", String(isExpanded));
    }
    summary.addEventListener("click", toggle);
    summary.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    });
    return toggle;
  }

  window.Theme = { el, showMessage, wireAccordionToggle };
})();
