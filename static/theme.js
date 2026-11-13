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
  // is passed directly. `kind` is "success" or "error".
  //
  // "success" (and any other non-"error" kind) auto-hides after 4s, same
  // as every app's local copy of this originally did - a quick "saved"
  // confirmation doesn't need to be read carefully or dismissed by hand.
  //
  // "error" never auto-hides - it gets a dismiss (x) button instead and
  // stays up until the user closes it or the next showMessage call
  // replaces it. An error is often the one piece of information worth
  // reading closely (which of 10 imports failed and why, a validation
  // message explaining what to fix) - a 4s timer risked it vanishing
  // before it had been read at all.
  function showMessage(text, kind, target = "page-message") {
    const target_el = typeof target === "string" ? document.getElementById(target) : target;
    if (!target_el) return;
    clearTimeout(showMessage._timers?.get(target_el));
    target_el.innerHTML = "";
    target_el.className = "page-message " + kind;

    const textEl = document.createElement("span");
    textEl.className = "page-message-text";
    textEl.textContent = text;
    target_el.appendChild(textEl);

    if (kind === "error") {
      const dismissBtn = document.createElement("button");
      dismissBtn.type = "button";
      dismissBtn.className = "page-message-dismiss";
      dismissBtn.setAttribute("aria-label", "Dismiss");
      dismissBtn.textContent = "×";
      dismissBtn.addEventListener("click", () => target_el.classList.add("hidden"));
      target_el.appendChild(dismissBtn);
    } else {
      (showMessage._timers ||= new WeakMap()).set(
        target_el,
        setTimeout(() => target_el.classList.add("hidden"), 4000)
      );
    }
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
  // Plain words for a failure the server gave no message with (a proxy's
  // error page, a login redirect...), instead of "/api/x -> 502".
  function friendlyStatus(status) {
    if (status === 401 || status === 403) return "You've been signed out or aren't allowed to do that - reload the page and try again.";
    if (status === 404) return "That couldn't be found - it may have been removed. Reload the page and try again.";
    if (status === 408 || status === 429) return "Too many requests right now - wait a moment and try again.";
    if (status >= 500) return "Something went wrong on the server - try again in a moment.";
    return `That didn't work (error ${status}).`;
  }

  async function fetchJSON(url, options) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (e) {
      // fetch only rejects when the request never got an answer.
      throw new Error("Couldn't reach the server - check your connection and try again. If you were signed out, reload the page.");
    }
    if (!res.ok) {
      // Any error response gets a message: the server's own when it sent a
      // readable one, otherwise plain words for the status.
      let detail = friendlyStatus(res.status);
      try {
        const body = await res.json();
        if (Array.isArray(body.detail)) {
          detail = body.detail.map((e) => e.msg || JSON.stringify(e)).join("; ") || detail;
        } else if (typeof body.detail === "string" && body.detail.trim()) {
          detail = body.detail;
        }
      } catch (e) {
        // not JSON (a proxy's error page, say) - keep the status wording
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

  // --- the new look (pages that opt in with <html data-ui="v2">) -------------
  //
  // Theme: the person chooses Light, Dark or Match my device. The choice is a
  // cookie on .evancooperman.com, so it follows them from app to app, and
  // theme-init.js (in <head>) applies it before the page paints. Same for the
  // sidebar's collapsed state. Pages that haven't opted in ignore all of this.
  const isV2 = () => document.documentElement.getAttribute("data-ui") === "v2";

  function readCookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function writeCookie(name, value) {
    const shared = /(^|\.)evancooperman\.com$/.test(location.hostname) ? "; domain=.evancooperman.com" : "";
    const age = value === null ? "; max-age=0" : "; max-age=31536000";
    document.cookie = `${name}=${value === null ? "" : encodeURIComponent(value)}; path=/; SameSite=Lax${shared}${age}`;
  }

  const THEME_CHOICES = ["device", "light", "dark"];
  const THEME_LABELS = { device: "Match my device", light: "Light", dark: "Dark" };
  const THEME_ICONS = { device: "theme-auto", light: "sun", dark: "moon" };

  function themeChoice() {
    const saved = readCookie("theme");
    return saved === "light" || saved === "dark" ? saved : "device";
  }

  function applyTheme() {
    if (!isV2()) return;
    const choice = themeChoice();
    const dark = choice === "dark" || (choice === "device" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }

  function setThemeChoice(choice) {
    writeCookie("theme", choice === "device" ? null : choice);
    applyTheme();
  }

  // When the choice is "Match my device", follow the device as it changes.
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (themeChoice() === "device") applyTheme();
    });
  }

  // The top-right corner of the page header: the theme button, then (see
  // mountUserBadge) the signed-in person. Made on first use.
  function headerTools() {
    const header = document.querySelector(".app-header");
    if (!header) return null;
    let tools = header.querySelector(".header-tools");
    if (!tools) {
      tools = el("div", { class: "header-tools" });
      header.appendChild(tools);
      header.classList.add("has-header-tools");
    }
    return tools;
  }

  // One small button that steps Light -> Dark -> Match my device. Does nothing
  // on a page that hasn't opted in.
  function mountThemeToggle() {
    if (!isV2()) return null;
    const tools = headerTools();
    // A page with no header (the time-management planner) gets the same
    // control as an entry in the sidebar instead.
    const nav = tools ? null : document.querySelector(".app-nav");
    if (!tools && !nav) return null;
    if ((tools || nav).querySelector(".theme-toggle")) return null;
    const icon = el("span", { "data-icon": "theme-auto", "aria-hidden": "true" });
    let button;
    let labelEl = null;
    if (tools) {
      button = el("button", { type: "button", class: "icon-btn theme-toggle" }, [icon]);
    } else {
      icon.className = "app-nav-icon";
      labelEl = el("span", { class: "app-nav-label" });
      button = el("button", { type: "button", class: "app-nav-link theme-toggle" }, [icon, labelEl]);
    }
    const refresh = () => {
      const choice = themeChoice();
      icon.dataset.icon = THEME_ICONS[choice];
      applyIcons(button);
      const next = THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length];
      button.title = `Theme: ${THEME_LABELS[choice]}. Click for ${THEME_LABELS[next]}.`;
      button.setAttribute("aria-label", button.title);
      if (labelEl) labelEl.textContent = "Theme";
    };
    button.addEventListener("click", () => {
      const next = THEME_CHOICES[(THEME_CHOICES.indexOf(themeChoice()) + 1) % THEME_CHOICES.length];
      setThemeChoice(next);
      refresh();
    });
    if (tools) {
      tools.prepend(button);
    } else {
      // Ahead of the Collapse control, which stays last.
      const collapse = nav.querySelector(".app-nav-collapse");
      nav.insertBefore(button, collapse || null);
    }
    refresh();
    return button;
  }

  // Renders theme.css's .app-nav into <div id="app-nav-mount">, generalized
  // from trip-planning's nav.js (the one app that already had this instead
  // of hand-written nav HTML per page). `items` is
  // [{href, icon, label, active, group}, ...] for links, or
  // {icon, label, onclick} (no href) for an action button like Refresh - the
  // app itself still decides its own links/icons/active-page logic (that's
  // inherently per-app routing), this just builds and mounts the DOM +
  // applies icons. Call after icons.js has loaded (applyIcons must exist).
  //
  // On a page with <html data-ui="v2"> it is a collapsible sidebar on a wide
  // screen (the bottom tab bar on a phone), and an item's optional `group`
  // ("Setup", "Admin") starts a titled section. The sidebar is also where
  // links to the other apps and the dashboard will go.
  // Calling it again later (e.g. once it is known whether this person is an
  // administrator) replaces the nav already on the page with the new items.
  // An item may also carry `badge: {id, count}`: a small count after its label.
  function buildNav(items, mountId = "app-nav-mount") {
    const mount = document.getElementById(mountId) || document.querySelector("nav.app-nav");
    if (!mount) return;
    const v2 = isV2();
    const children = [];
    let group = null;
    for (const item of items) {
      if (v2 && (item.group || null) !== group) {
        group = item.group || null;
        children.push(group ? el("div", { class: "app-nav-group", text: group }) : el("div", { class: "app-nav-group-gap" }));
      }
      const iconSpan = el("span", { class: "app-nav-icon", "data-icon": item.icon, "aria-hidden": "true" });
      const label = el("span", { class: "app-nav-label", text: item.label });
      const content = [iconSpan, label];
      if (item.badge) {
        content.push(
          el("span", {
            id: item.badge.id || null,
            class: "item-badge item-badge-accent nav-count" + (item.badge.count ? "" : " hidden"),
            text: String(item.badge.count || 0),
          })
        );
      }
      children.push(
        item.href
          ? el("a", { href: item.href, class: "app-nav-link" + (item.active ? " active" : ""), title: item.label }, content)
          : el("button", { type: "button", class: "app-nav-link", title: item.label, onclick: item.onclick }, content)
      );
    }
    if (v2) {
      const root = document.documentElement;
      const collapse = el("button", { type: "button", class: "app-nav-link app-nav-collapse" }, [
        el("span", { class: "app-nav-icon", "data-icon": "panel-left", "aria-hidden": "true" }),
        el("span", { class: "app-nav-label", text: "Collapse" }),
      ]);
      const sync = () => {
        const collapsed = root.classList.contains("nav-collapsed");
        collapse.title = collapsed ? "Expand the sidebar" : "Collapse the sidebar";
        collapse.setAttribute("aria-label", collapse.title);
        collapse.setAttribute("aria-expanded", String(!collapsed));
      };
      collapse.addEventListener("click", () => {
        root.classList.toggle("nav-collapsed");
        writeCookie("nav", root.classList.contains("nav-collapsed") ? "collapsed" : "expanded");
        sync();
      });
      sync();
      children.push(collapse);
    }
    const nav = el("nav", { class: "app-nav", "aria-label": "Main" }, children);
    mount.replaceWith(nav);
    if (typeof applyIcons === "function") applyIcons(nav);
    mountThemeToggle();
  }

  // Folds a row of buttons into one "..." menu, keeping only the main ones in
  // view. The real buttons stay in the page, hidden, and each menu item presses
  // its button - so handlers, and code that shows or hides a button with the
  // "hidden" class (a button that is hidden is left out of the menu), carry on
  // working untouched.
  //   Global.foldActions(row, {
  //     keep: "#save, #done",   // selector for the children that stay visible
  //     ariaLabel: "More actions",
  //     icon: (button) => "trash" | null,   // optional; default by class and text
  //   })
  // Does nothing (returns null) on a page that hasn't opted in to the new look.
  // Anything marked .danger / .danger-btn goes last, set apart by a separator.
  function foldActions(row, { keep = "", ariaLabel = "More actions", icon = null, offered = null } = {}) {
    if (!row || !isV2()) return null;
    const folded = [...row.children].filter((child) => !(keep && child.matches(keep)));
    if (!folded.length) return null;
    const isDanger = (b) => b.classList.contains("danger") || b.classList.contains("danger-btn");
    const defaultIcon = (b) => {
      if (isDanger(b)) return "trash";
      if (b.textContent.toLowerCase().includes("archive")) return "archive";
      return "sliders"; // never leave a row bare: a menu with some icons and some not looks broken
    };
    const isOffered = offered || ((b) => !b.classList.contains("hidden") && !b.hidden);
    const holder = el("div", { class: "hidden" }, folded);
    const menu = buildMenu({
      icon: "more",
      ariaLabel,
      items: () => {
        const normal = [];
        const danger = [];
        for (const button of folded) {
          if (!isOffered(button)) continue;
          const item = {
            label: button.textContent.trim(),
            icon: (icon && icon(button)) || defaultIcon(button),
            danger: isDanger(button),
            onclick: () => button.click(),
          };
          (item.danger ? danger : normal).push(item);
        }
        return danger.length && normal.length ? [...normal, { separator: true }, ...danger] : [...normal, ...danger];
      },
    });
    row.append(holder, menu);
    return menu;
  }

  // A button that opens a small menu of actions: the "..." on a card, or a
  // "Share" button with its choices. Styles are theme.css's .menu. Returns the
  // wrapper element to place on the page.
  //
  //   Global.buildMenu({
  //     icon: "more",                  // icons.js name; omit for a text-only button
  //     label: "Share",                // button text; omit for an icon-only button
  //     ariaLabel: "More actions",     // required for an icon-only button (also its tooltip)
  //     triggerClass: "icon-btn",      // default "icon-btn" with no label, "secondary-btn" with one
  //     align: "right",                // which edge of the button the menu lines up with
  //     items: [                       // or a function returning this, run each time it opens
  //       { label: "Edit", icon: "edit", onclick: () => ... },
  //       { label: "Visit website", icon: "link", href: "https://..." },
  //       { separator: true },
  //       { label: "Delete...", icon: "trash", danger: true, onclick: () => ... },
  //     ],
  //   });
  //
  // Closes on a click anywhere else, Escape (focus goes back to the button) or
  // choosing an item. Only one menu is open at a time.
  function buildMenu({ icon = null, label = "", ariaLabel = "", triggerClass = null, align = "right", items }) {
    const trigger = el("button", {
      type: "button",
      class: triggerClass || (label ? "secondary-btn" : "icon-btn"),
      "aria-haspopup": "menu",
      "aria-expanded": "false",
    });
    if (icon) trigger.appendChild(el("span", { class: "btn-icon", "data-icon": icon, "aria-hidden": "true" }));
    if (label) trigger.appendChild(document.createTextNode(label));
    const name = ariaLabel || label;
    if (name) {
      trigger.setAttribute("aria-label", name);
      if (!label) trigger.title = name;
    }
    const menu = el("div", { class: "menu hidden", role: "menu" });
    if (align === "left") {
      menu.style.left = "0";
      menu.style.right = "auto";
    }
    const wrap = el("div", { class: "menu-wrap" }, [trigger, menu]);
    if (typeof applyIcons === "function") applyIcons(trigger);

    const close = () => {
      menu.classList.add("hidden");
      trigger.setAttribute("aria-expanded", "false");
    };
    const render = () => {
      menu.replaceChildren();
      for (const item of typeof items === "function" ? items() : items) {
        if (!item) continue;
        if (item.separator) {
          menu.appendChild(el("div", { class: "menu-sep", role: "separator" }));
          continue;
        }
        const children = [];
        if (item.icon) children.push(el("span", { class: "menu-icon", "data-icon": item.icon, "aria-hidden": "true" }));
        children.push(item.label);
        const attrs = { class: "menu-item" + (item.danger ? " danger" : ""), role: "menuitem" };
        let row;
        if (item.href) {
          row = el("a", { ...attrs, href: item.href, target: "_blank", rel: "noopener" }, children);
          row.addEventListener("click", close);
        } else {
          row = el("button", { ...attrs, type: "button" }, children);
          row.addEventListener("click", () => {
            close();
            if (item.onclick) item.onclick();
          });
        }
        menu.appendChild(row);
      }
      if (typeof applyIcons === "function") applyIcons(menu);
    };
    trigger.addEventListener("click", (e) => {
      e.stopPropagation(); // a card's own click handler (expand/collapse) must not also fire
      const opening = menu.classList.contains("hidden");
      document.querySelectorAll(".menu:not(.hidden)").forEach((m) => m.classList.add("hidden"));
      if (opening) {
        render();
        menu.classList.remove("hidden");
        trigger.setAttribute("aria-expanded", "true");
        const first = menu.querySelector(".menu-item");
        if (first && e.detail === 0) first.focus(); // opened from the keyboard
      }
    });
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !menu.classList.contains("hidden")) {
        e.stopPropagation();
        close();
        trigger.focus();
      }
    });
    return wrap;
  }

  document.addEventListener("click", () => {
    document.querySelectorAll(".menu:not(.hidden)").forEach((m) => {
      m.classList.add("hidden");
      const trigger = m.parentElement && m.parentElement.querySelector("[aria-haspopup]");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  });

  // --- who is signed in (apps with accounts) ---
  // There's no login form: Cloudflare Access signs people in and the app
  // learns who they are from it (see the scaffold's app/auth.py). An app with
  // accounts answers GET /api/me with {id, email}; this reads it once per page
  // and shares the result. Resolves to null if the app has no /api/me or the
  // call fails, so callers can treat "no user" as "nothing to show".
  let mePromise = null;
  let meRejected = false; // the server said 401: signed out, or a token it won't accept
  function currentUser() {
    if (!mePromise) {
      mePromise = fetch("/api/me")
        .then((res) => {
          meRejected = res.status === 401;
          return res.ok ? res.json() : null;
        })
        .catch(() => null);
    }
    return mePromise;
  }

  // The signed-in person's email and a Log out link, in the top corner of the
  // page header (theme.css's .user-badge). Log out ends their Cloudflare
  // Access session for this app; the next visit asks them to sign in again.
  // Does nothing when there's no user. Call once per page, after the DOM exists.
  // Pass { profileHref } (an app with a Profile page) to make the email a link to it.
  async function mountUserBadge(target = document.querySelector(".app-header"), { profileHref = null } = {}) {
    if (!target) return null;
    const user = await currentUser();
    // A rejected sign-in (expired or stale session) is when a way out matters
    // most: without a user there'd be no badge, and no way to start over.
    if (!user && !meRejected) return null;
    const emailAttrs = {
      class: "user-badge-email",
      text: user ? user.email : "Sign-in problem",
      title: user ? `Signed in as ${user.email}` : "The server didn't accept your sign-in - log out, then sign in again",
    };
    if (user && profileHref) {
      emailAttrs.href = profileHref;
      emailAttrs.title = `Signed in as ${user.email} - open your profile`;
    }
    const badge = el("div", { class: "user-badge" }, [
      el(user && profileHref ? "a" : "span", emailAttrs),
      el("a", { class: "user-badge-logout", href: "/cdn-cgi/access/logout", text: "Log out" }),
    ]);
    const tools = isV2() && target === document.querySelector(".app-header") ? headerTools() : null;
    if (tools) {
      tools.appendChild(badge);
    } else {
      target.appendChild(badge);
      target.classList.add("has-user-badge"); // makes room for it above the title
    }
    return badge;
  }

  // --- "name it" prompt, for creating something from inside a dropdown ---------
  //
  // The way to make a new category, label or the like without leaving the page:
  // the dropdown has an "Add new ..." entry, and choosing it swaps `anchor` (the
  // control) for a small form - a name box, Add and Cancel - until it is
  // answered. `submit(name)` does the creating and resolves with whatever the
  // caller wants back (null if it failed, having shown why); `done(result)` gets
  // that, or null if the person cancelled or typed nothing. Enter adds, Escape
  // cancels. The class options let a page keep its own layout rules.
  function askForName(anchor, { placeholder = "New name", maxlength = 40, formClass = "", inputClass = "", cancelClass = "cancel-btn", submit }, done) {
    const nameInput = el("input", { type: "text", class: inputClass, placeholder, maxlength: String(maxlength), "aria-label": placeholder });
    const addBtn = el("button", { type: "button", class: "save-btn", text: "Add" });
    const cancelBtn = el("button", { type: "button", class: cancelClass, text: "Cancel" });
    const form = el("span", { class: `ask-name-form ${formClass}`.trim() }, [nameInput, addBtn, cancelBtn]);
    anchor.classList.add("hidden");
    anchor.after(form);
    nameInput.focus();
    let finished = false;
    const finish = (result) => {
      if (finished) return;
      finished = true;
      form.remove();
      anchor.classList.remove("hidden");
      done(result);
    };
    let adding = false;
    const add = async () => {
      if (adding) return;
      adding = true;
      const typed = nameInput.value.trim();
      finish(typed ? await submit(typed) : null);
    };
    addBtn.addEventListener("click", add);
    cancelBtn.addEventListener("click", () => finish(null));
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        add();
      } else if (e.key === "Escape") {
        e.stopPropagation(); // cancel this prompt, not also the dropdown it sits in
        finish(null);
      }
    });
  }

  // --- multiselect dropdown (theme.css's .multiselect/.multiselect-trigger/
  // .multiselect-panel) - a button that opens a checklist panel, for
  // filtering a list by an open-ended set of options (categories, tags,
  // ...) where a plain <select> only lets you pick one at a time and a row
  // of toggle chips stops scaling once there are more than a handful.
  // Promoted from trip-planning's category filter (its first use), meant
  // to be reused by any app filtering a list this way.
  //
  // options: [{value, label, color}] - color is optional, renders a small
  // swatch before the label (e.g. a category's color) when given.
  // selected: initial array of selected values (compared as strings).
  // onChange(selectedValues) fires on every check/uncheck/Clear, with the
  // full current array of selected values (strings) - the caller owns
  // filtering its own list from that, this widget only owns the UI.
  // addNew: {label, placeholder, create(name)} - optional; adds an "Add new..."
  // button that asks for a name, calls create(name) (resolving with an option
  // {value, label, color}, or null if it failed) and adds the result ticked.
  // A name the list already has (any capitalisation) is just ticked instead.
  function buildMultiSelect({ options, selected = [], placeholder = "All", onChange, addNew = null }) {
    options = [...options];
    let current = new Set(selected.map(String));

    const trigger = el("button", { type: "button", class: "multiselect-trigger", "aria-haspopup": "listbox", "aria-expanded": "false" }, [
      el("span", { class: "multiselect-trigger-label" }),
      el("span", { class: "multiselect-trigger-arrow", "aria-hidden": "true", text: "▾" }),
    ]);
    const triggerLabel = trigger.querySelector(".multiselect-trigger-label");

    function refreshTriggerLabel() {
      if (current.size === 0) {
        triggerLabel.textContent = placeholder;
      } else if (current.size === 1) {
        const opt = options.find((o) => String(o.value) === [...current][0]);
        triggerLabel.textContent = opt ? opt.label : `1 selected`;
      } else {
        triggerLabel.textContent = `${current.size} selected`;
      }
    }
    refreshTriggerLabel();

    function makeRow(opt) {
      const value = String(opt.value);
      const checkbox = el("input", { type: "checkbox" });
      checkbox.dataset.value = value;
      checkbox.checked = current.has(value);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) current.add(value);
        else current.delete(value);
        refreshTriggerLabel();
        if (onChange) onChange([...current]);
      });
      const children = [checkbox];
      if (opt.color) {
        const swatch = el("span", { class: "multiselect-option-swatch", "aria-hidden": "true" });
        swatch.style.setProperty("--swatch-color", opt.color);
        children.push(swatch);
      }
      children.push(el("span", { class: "multiselect-option-label", text: opt.label }));
      return el("label", { class: "multiselect-option" }, children);
    }
    const optionRows = options.map(makeRow);

    const clearBtn = el("button", {
      type: "button",
      class: "multiselect-clear",
      text: "Clear",
      onclick: () => {
        current = new Set();
        for (const row of optionRows) row.querySelector("input").checked = false;
        refreshTriggerLabel();
        if (onChange) onChange([]);
      },
    });

    const actions = el("div", { class: "multiselect-panel-actions" }, [clearBtn]);
    const panel = el("div", { class: "multiselect-panel hidden", role: "listbox" }, [...optionRows, actions]);

    function tick(row) {
      const box = row.querySelector("input");
      box.checked = true;
      current.add(String(box.dataset.value));
      refreshTriggerLabel();
      if (onChange) onChange([...current]);
    }

    if (addNew) {
      actions.classList.add("multiselect-panel-actions-split");
      const addBtn = el("button", { type: "button", class: "multiselect-clear", text: addNew.label || "Add new..." });
      actions.prepend(addBtn);
      addBtn.addEventListener("click", () => {
        askForName(
          addBtn,
          {
            placeholder: addNew.placeholder || "New name",
            submit: async (name) => {
              const index = options.findIndex((o) => o.label.toLowerCase() === name.toLowerCase());
              if (index >= 0) return optionRows[index];
              const created = await addNew.create(name);
              if (!created) return null;
              options.push(created);
              const row = makeRow(created);
              optionRows.push(row);
              actions.before(row);
              return row;
            },
          },
          (row) => {
            if (row) tick(row);
          }
        );
      });
    }

    trigger.addEventListener("click", () => {
      const opening = panel.classList.contains("hidden");
      // Only one panel open at a time - close any other open multiselect
      // before opening this one (same idea as the modal backdrop dismiss).
      document.querySelectorAll(".multiselect-panel:not(.hidden)").forEach((p) => {
        p.classList.add("hidden");
        p.previousElementSibling?.setAttribute("aria-expanded", "false");
      });
      panel.classList.toggle("hidden", !opening);
      trigger.setAttribute("aria-expanded", String(opening));
    });

    return el("div", { class: "multiselect" }, [trigger, panel]);
  }

  document.addEventListener("click", (e) => {
    // A click on something that has just been taken out of the page (Cancel on
    // the "name it" form) is not a click outside the dropdown.
    if (!e.target.isConnected) return;
    document.querySelectorAll(".multiselect-panel:not(.hidden)").forEach((panel) => {
      const root = panel.closest(".multiselect");
      if (root && !root.contains(e.target)) {
        panel.classList.add("hidden");
        panel.previousElementSibling?.setAttribute("aria-expanded", "false");
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    document.querySelectorAll(".multiselect-panel:not(.hidden)").forEach((panel) => {
      panel.classList.add("hidden");
      panel.previousElementSibling?.setAttribute("aria-expanded", "false");
    });
  });

  // --- loading states (theme.css's .is-loading/.spinner/.loading-inline) ---
  //
  // Any section of a page that waits on async data should show a spinner so
  // it's obvious something is happening. Easiest form:
  //
  //   const rows = await Global.withLoading(listEl, Global.fetchJSON(url));
  //
  // which shows the spinner on listEl, waits, and always clears it (even if
  // the fetch throws). showLoading/hideLoading are the manual pair for
  // flows that don't fit one promise.
  //
  // An empty section (first load) shows the spinner straight away; one that
  // already has content (a refresh) is only dimmed + spinnered if the wait
  // passes 250ms, so quick refreshes don't flicker. Render code can clear
  // the section itself - hideLoading() still must run to drop the state.
  const _loadTimers = new WeakMap();
  const _loadCounts = new WeakMap();

  function showLoading(target) {
    if (!target) return;
    clearTimeout(_loadTimers.get(target));
    const apply = () => {
      target.classList.add("is-loading");
      if (!target.querySelector(":scope > .spinner")) {
        target.appendChild(el("div", { class: "spinner", role: "status", "aria-label": "Loading" }));
      }
    };
    if (target.firstElementChild) _loadTimers.set(target, setTimeout(apply, 250));
    else apply();
  }

  function hideLoading(target) {
    if (!target) return;
    clearTimeout(_loadTimers.get(target));
    target.classList.remove("is-loading");
    target.querySelectorAll(":scope > .spinner").forEach((n) => n.remove());
  }

  // Wraps a promise (or a function returning one) in show/hideLoading.
  // Counts overlapping calls per target so a slow earlier request finishing
  // first doesn't hide the spinner while a newer one is still in flight.
  async function withLoading(target, work) {
    _loadCounts.set(target, (_loadCounts.get(target) || 0) + 1);
    showLoading(target);
    try {
      return await (typeof work === "function" ? work() : work);
    } finally {
      const n = (_loadCounts.get(target) || 1) - 1;
      _loadCounts.set(target, n);
      if (n <= 0) hideLoading(target);
    }
  }

  // --- click-to-edit fields (theme.css's .inline-edit*) ---
  //
  // A value that reads as plain text until you click it, then becomes an
  // input; leaving the field (or Enter) saves just that field, Esc cancels.
  //
  //   const field = Global.inlineEdit({
  //     type: "text",                    // text | url | date | textarea | select
  //     value: item.name,                // always a string ("" = empty)
  //     required: true,                  // clearing it reverts instead of saving
  //     requiredMessage: "Name is required.",
  //     placeholder: "Click to add",     // shown (muted) while empty
  //     className: "my-title",           // extra class(es) on the wrapper, for context-specific sizing
  //     options: [{ value, label }],     // select only
  //     format: (v) => prettyDate(v),    // optional display text for a value
  //     onSave: async (v) => { ...PATCH...; return savedValueAsString; },
  //   });
  //
  // onSave persists the new value and resolves with the value to show (so
  // the server can normalize it); if it throws, the error is shown and the
  // field reverts to what it was. Nothing is sent if the value is unchanged.
  // Keys: Enter saves (Ctrl/Cmd+Enter in a textarea), Esc cancels, Tab saves
  // and moves on. A <select> saves as soon as you pick an option.
  //
  // Only meant for devices with a mouse: on touch, a tap to edit competes
  // with scrolling, pops the keyboard on stray taps, and blur-to-save fires
  // when the keyboard dismisses. Callers check supportsInlineEdit() and keep
  // their ordinary form (with a Save button) everywhere else.
  function supportsInlineEdit() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  function inlineEdit({
    type = "text",
    value = "",
    options = [],
    placeholder = "Click to add",
    required = false,
    requiredMessage = "This field can't be empty.",
    className = "",
    rows = 2,
    format,
    onSave,
  }) {
    let current = value == null ? "" : String(value);
    const root = el("div", { class: "inline-edit" + (className ? ` ${className}` : "") });

    function displayText() {
      if (type === "select") {
        const match = options.find((o) => String(o.value) === current);
        return match ? match.label : "";
      }
      if (current === "") return "";
      return format ? format(current) : current;
    }

    function render(refocus = false) {
      // Keep keyboard focus on the field after Enter/Esc; but if focus has
      // already moved on (Tab, or a click elsewhere), leave it alone.
      const hadFocus = refocus || root.contains(document.activeElement);
      const text = displayText();
      const empty = current === "" || text === "";
      const display = el("div", {
        class: "inline-edit-display" + (empty ? " empty" : ""),
        tabindex: "0",
        role: "button",
        text: type === "select" ? text || placeholder : empty ? placeholder : text,
      });
      display.addEventListener("click", startEdit);
      display.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          startEdit();
        }
      });
      root.classList.remove("saving", "editing");
      root.replaceChildren(display);
      if (hadFocus) display.focus();
    }

    function startEdit() {
      let input;
      if (type === "select") {
        input = el(
          "select",
          {},
          options.map((o) => el("option", { value: String(o.value), text: o.label }))
        );
      } else if (type === "textarea") {
        input = el("textarea", { rows: String(rows) });
      } else {
        input = el("input", { type });
      }
      input.classList.add("inline-edit-input");
      input.value = current;
      root.classList.add("editing");
      root.replaceChildren(input);
      input.focus();
      if (input.select && type !== "select" && type !== "date") input.select();

      // `finished` guards the classic bug: Esc removes the input, removal
      // fires blur, and blur would then save the edit that was just cancelled.
      let finished = false;

      async function commit() {
        if (finished) return;
        finished = true;
        // Captured now: disabling the input below drops its focus, which
        // would otherwise look like focus had already moved elsewhere.
        const refocus = root.contains(document.activeElement);
        const next = type === "select" || type === "date" ? input.value : input.value.trim();
        if (required && next === "") {
          showMessage(requiredMessage, "error");
          render(refocus);
          return;
        }
        if (next === current) {
          render(refocus);
          return;
        }
        input.disabled = true;
        root.classList.add("saving");
        try {
          const saved = await onSave(next);
          current = saved == null ? next : String(saved);
        } catch (err) {
          showMessage(err.message || String(err), "error");
        }
        render(refocus);
      }

      function cancel() {
        if (finished) return;
        finished = true;
        render();
      }

      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cancel();
        } else if (e.key === "Enter") {
          if (type === "textarea" && !(e.ctrlKey || e.metaKey)) return; // newline
          e.preventDefault();
          commit();
        }
      });
      if (type === "select") {
        input.addEventListener("change", commit);
        input.addEventListener("blur", cancel);
      } else {
        input.addEventListener("blur", commit);
      }
    }

    render();
    // For callers that learn a field's value changed some other way.
    root.setValue = (v) => {
      current = v == null ? "" : String(v);
      if (!root.classList.contains("editing")) render();
    };
    return root;
  }

  window.Global = {
    el,
    showMessage,
    wireAccordionToggle,
    fetchJSON,
    friendlyStatus,
    domainFromUrl,
    toISODate,
    dateInputToISO,
    formatDateBadge,
    openModal,
    closeModal,
    buildNav,
    buildMultiSelect,
    buildMenu,
    foldActions,
    askForName,
    showLoading,
    hideLoading,
    withLoading,
    inlineEdit,
    supportsInlineEdit,
    currentUser,
    mountUserBadge,
    mountThemeToggle,
    themeChoice,
    setThemeChoice,
  };
})();
