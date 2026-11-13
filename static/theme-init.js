// Runs in <head>, before the page paints, so the chosen theme and the sidebar's
// collapsed state are in place from the first frame (no flash of the wrong
// theme). Only does anything on a page that opted in with <html data-ui="v2">;
// every other page stays as it was. The choices live in cookies on
// .evancooperman.com, so one choice covers every app (theme.js sets them).
(function () {
  var root = document.documentElement;
  if (root.getAttribute("data-ui") !== "v2") return;
  function get(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }
  var choice = get("theme"); // "light", "dark", or nothing = match the device
  var dark = choice === "dark" || (choice !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");
  // The sidebar's state is remembered once the person has chosen ("collapsed" or
  // "expanded"). Until then a page can ask to start collapsed on a screen narrower
  // than data-nav-collapse-below pixels (a page that already has a wide panel of
  // its own, like the time-management planner, would otherwise be squeezed).
  var nav = get("nav");
  var below = parseInt(root.getAttribute("data-nav-collapse-below") || "0", 10);
  if (nav === "collapsed" || (!nav && below && window.innerWidth < below)) root.classList.add("nav-collapsed");
})();
