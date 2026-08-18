// Shared DOM/UI/fetch/date helpers for every app under evancooperman.com,
// exposed as window.Global so plain <script> includes work with no build
// step (matches the house no-build-step convention). Pairs with theme.css's
// component classes (.page-message, .item-card/.item-summary/.item-details,
// .modal-overlay/.modal, ...) - see README.md for the full picture.
//
// Deliberately NOT here: anything genuinely app-specific (API_BASE, domain
// object formatting like formatCost/formatDuration, Google Maps deep-
// linking, ...) - those stay in each app's own static/*.js. If you find a
// function duplicated in 2+ apps that isn't here yet, it belongs here -
// see "Adding a new shared component" in README.md.

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

  // Fetch wrapper used identically (down to the variable names) in every
  // app: throws a readable Error on a non-2xx response instead of making
  // every call site check res.ok itself, and treats 204 No Content as a
  // valid empty result rather than trying to .json() it. The 422/
  // Array.isArray(body.detail) branch handles FastAPI/Pydantic validation
  // errors (a list of {loc, msg, ...} objects, not a string) - originally
  // only trip-planning had this; every app gets it now since it's a
  // strict improvement (a readable message instead of "[object Object]").
  // (Some apps' local copies also attached `err.status = res.status`, but
  // nothing anywhere actually read that field, so it's dropped here.)
  async function fetchJSON(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      let detail = `${url} -> ${res.status}`;
      try {
        const body = await res.json();
        if (Array.isArray(body.detail)) {
          detail = body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ");
        } else if (body.detail) {
          detail = body.detail;
        }
      } catch (e) {
        // ignore, use default detail
      }
      throw new Error(detail);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Byte-identical across gifts/social-planning/trip-planning before this
  // move.
  function domainFromUrl(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return null;
    }
  }

  // Plain-date (no time-of-day) helpers, used the same way in every app
  // that has a plain `<input type="date">` field. Apps that also handle
  // time-of-day (trip-planning's scheduled_start/scheduled_end) keep their
  // own richer datetime helpers locally - these two cover the common case.
  function toISODate(isoDateTime) {
    if (!isoDateTime) return "";
    return isoDateTime.slice(0, 10);
  }

  function dateInputToISO(value) {
    return value ? `${value}T00:00:00` : null;
  }

  function formatDateBadge(isoDateTime) {
    if (!isoDateTime) return null;
    const [y, m, d] = isoDateTime.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // --- modals (theme.css's .modal-overlay/.modal/.modal-close/
  // .modal-actions) - originally only time-management's pattern, promoted
  // here since it's a well-formed reusable component, not because it was
  // duplicated. openModal/closeModal are just classList sugar; the real
  // value is the module-level dismiss wiring below (Escape key, and
  // clicking the dark backdrop outside the modal box), which works for
  // every `.modal-overlay` on the page automatically, including ones
  // built after this file loads - no per-modal setup needed. This is new
  // behavior time-management's modals didn't have before.
  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList && e.target.classList.contains("modal-overlay")) {
      e.target.classList.add("hidden");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".modal-overlay:not(.hidden)").forEach((m) => m.classList.add("hidden"));
  });

  // Renders theme.css's .app-nav into <div id="app-nav-mount">, generalized
  // from trip-planning's nav.js (the one app that already had this instead
  // of hand-written nav HTML per page). `items` is
  // [{href, icon, label, active}, ...] for links, or {icon, label, onclick}
  // (no href) for an action button like Refresh - the app itself still
  // decides its own links/icons/active-page logic (that's inherently
  // per-app routing), this just builds and mounts the DOM + applies icons.
  // Call after icons.js has loaded (applyIcons must exist).
  function buildNav(items, mountId = "app-nav-mount") {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const nav = el(
      "nav",
      { class: "app-nav" },
      items.map((item) => {
        const iconSpan = el("span", { class: "app-nav-icon", "data-icon": item.icon, "aria-hidden": "true" });
        const label = item.label;
        return item.href
          ? el("a", { href: item.href, class: "app-nav-link" + (item.active ? " active" : "") }, [iconSpan, label])
          : el("button", { type: "button", class: "app-nav-link", onclick: item.onclick }, [iconSpan, label]);
      })
    );
    mount.replaceWith(nav);
    if (typeof applyIcons === "function") applyIcons(nav);
  }

  window.Global = {
    el,
    showMessage,
    wireAccordionToggle,
    fetchJSON,
    domainFromUrl,
    toISODate,
    dateInputToISO,
    formatDateBadge,
    openModal,
    closeModal,
    buildNav,
  };
})();
