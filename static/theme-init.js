// Runs in <head>, before the page paints, so the chosen theme and the sidebar's
// collapsed state are in place from the first frame (no flash of the wrong
// theme). Only does anything on a page that opted in with <html data-ui="v2">;
// every other page stays as it was. The choices live in cookies on
// .evancooperman.com, so one choice covers every app (theme.js sets them).
//
// Also the one place the tab icon (favicon) comes from: the brass-gears logo, on every page that loads this script, so a new page
// needs no icon tags of its own (see "Tab icon" below).
(function () {
  // Tab icon. Added once the head has been read, so a page that already links its own icon is left alone and never gets two. The
  // address comes from this script's own URL, so it follows whichever shared-assets host the page uses (local or production).
  var self = document.currentScript;
  if (self && self.src) {
    var base = self.src.split("?")[0].replace(/[^\/]*$/, "");
    var addIcons = function () {
      if (document.querySelector('link[rel~="icon"]')) return;
      var svg = document.createElement("link");
      svg.rel = "icon";
      svg.type = "image/svg+xml";
      svg.href = base + "logo.svg";
      var png = document.createElement("link"); // for browsers that don't draw SVG tab icons
      png.rel = "icon";
      png.type = "image/png";
      png.sizes = "64x64";
      png.href = base + "favicon.png";
      document.head.appendChild(svg);
      document.head.appendChild(png);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addIcons);
    else addIcons();
  }
})();

(function () {
  var root = document.documentElement;
  if (root.getAttribute("data-ui") !== "v2") return;
  function get(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  var choice = get("theme"); // "light", "dark", "device", or nothing
  // A page can start light for everyone who has not chosen (<html data-theme-default="light">):
  // the resume app does, since a dark page could put off a recruiter. Nothing chosen = light
  // there; "device" (picked with the theme button) still follows the device.
  if (!choice && root.getAttribute("data-theme-default") === "light") choice = "light";
  var dark = choice === "dark" || (choice !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  // The browser's own chrome (phone status bar, address bar) takes the page background
  // so it keeps its contrast in dark mode instead of staying the app's fixed colour.
  // Re-done by theme.js whenever the theme changes.
  try {
    var bg = getComputedStyle(root).getPropertyValue("--bg").trim();
    if (bg) {
      var metas = document.querySelectorAll('meta[name="theme-color"]');
      var meta = metas[0] || document.head.appendChild(document.createElement("meta"));
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", bg);
      meta.removeAttribute("media");
      for (var i = 1; i < metas.length; i++) metas[i].parentNode.removeChild(metas[i]);
    }
  } catch (e) {}
  // The sidebar's state is remembered once the person has chosen ("collapsed" or
  // "expanded"). Until then a page can ask to start collapsed on a screen narrower
  // than data-nav-collapse-below pixels (a page that already has a wide panel of
  // its own, like the time-management planner, would otherwise be squeezed).
  var nav = get("nav");
  var below = parseInt(root.getAttribute("data-nav-collapse-below") || "0", 10);
  if (nav === "collapsed" || (!nav && below && window.innerWidth < below)) root.classList.add("nav-collapsed");
})();
