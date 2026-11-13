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
  if (get("nav") === "collapsed") root.classList.add("nav-collapsed");
})();
