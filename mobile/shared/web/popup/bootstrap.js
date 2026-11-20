// Runs before an action popup's own scripts and gives the page `window.lpm`:
// the JSON its `data` command printed (or `text` when it wasn't JSON, and
// `error` when the command failed), lpm's colors as `theme` and as `--lpm-*`
// CSS variables, `onData(fn)` for the values a refresh brings, `view` ("popup"
// in a card, "tab" as the action's app) and `open(url)` for a web page in the
// browser. The apps replace the token it's called with below with that payload
// as JSON: the phones when they inject it, the desktop in
// desktop/frontend/src/popup/popupDocument.ts.
(function (payload) {
  "use strict";
  var listeners = [];
  var lpm = {
    data: payload.data === undefined ? null : payload.data,
    text: payload.text || "",
    error: payload.error || "",
    theme: payload.theme || { mode: "dark", colors: {} },
    project: payload.project || "",
    action: payload.action || "",
    view: payload.view === "tab" ? "tab" : "popup",
    onData: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
    },
    // A frame can't open a window of its own, so it asks the app around it.
    open: function (url) {
      url = String(url == null ? "" : url);
      if (!/^https?:\/\//i.test(url)) return;
      if (window.parent !== window) window.parent.postMessage({ lpmOpen: url }, "*");
      else window.open(url, "_blank");
    },
  };

  function applyTheme() {
    var root = document.documentElement;
    if (!root) return;
    root.style.colorScheme = lpm.theme.mode === "light" ? "light" : "dark";
    var colors = lpm.theme.colors || {};
    for (var key in colors) {
      if (Object.prototype.hasOwnProperty.call(colors, key)) {
        root.style.setProperty("--lpm-" + key, String(colors[key]));
      }
    }
  }

  function push(next) {
    if (!next || typeof next !== "object") return;
    lpm.data = next.data === undefined ? null : next.data;
    lpm.text = next.text || "";
    lpm.error = next.error || "";
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](lpm.data, lpm);
      } catch (e) {
        if (window.console) console.error(e);
      }
    }
  }

  Object.defineProperty(window, "lpm", { value: lpm });
  Object.defineProperty(window, "__lpmPush", { value: push });
  window.addEventListener("message", function (event) {
    if (window.parent === window || event.source !== window.parent) return;
    if (event.data && event.data.lpmPopup) push(event.data.lpmPopup);
  });
  applyTheme();
  document.addEventListener("DOMContentLoaded", applyTheme);
})(__LPM_POPUP_PAYLOAD__);
