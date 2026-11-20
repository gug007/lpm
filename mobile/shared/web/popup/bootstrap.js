// Runs before an action popup's own scripts and gives the page `window.lpm`:
// the JSON its `data` command printed (or `text` when it wasn't JSON, and
// `error` when the command failed), lpm's colors as `theme` and as `--lpm-*`
// CSS variables, `onData(fn)` for the values a refresh brings, `view` ("popup"
// in a card, "tab" as the action's app), `open(url)` for a web page in the
// browser, `run(action, inputs)` to run one of the project's actions as its
// button would, and `refresh()` to run the data command again. The apps replace
// the token it's called with below with that payload as JSON: the phones when
// they inject it, the desktop in desktop/frontend/src/popup/popupDocument.ts.
(function (payload) {
  "use strict";
  var listeners = [];
  var waiting = {};
  var asked = 0;

  // What the page asks of the app around it: the frame's parent, the phone's
  // message handler, or the desktop's own address for its pages.
  function post(message) {
    var handlers = window.webkit && window.webkit.messageHandlers;
    if (window.parent !== window) window.parent.postMessage(message, "*");
    else if (handlers && handlers.lpm) handlers.lpm.postMessage(message);
    else if (window.lpmAndroid) window.lpmAndroid.postMessage(JSON.stringify(message));
    else if (payload.post) {
      fetch(payload.post, { method: "POST", mode: "no-cors", body: JSON.stringify(message) }).catch(function () {});
    } else return false;
    return true;
  }

  function settle(id, result) {
    var resolve = waiting[id];
    if (!resolve) return;
    delete waiting[id];
    result = result && typeof result === "object" ? result : {};
    resolve({
      ok: result.ok === true,
      output: typeof result.output === "string" ? result.output : "",
      error: typeof result.error === "string" ? result.error : "",
      canceled: result.canceled === true,
    });
  }

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
    // Resolves with { ok, output, error, canceled } once the action is done, or
    // once it starts when it runs in a terminal.
    run: function (action, inputs) {
      var id = String(++asked);
      var values = {};
      if (inputs && typeof inputs === "object") {
        for (var key in inputs) {
          if (Object.prototype.hasOwnProperty.call(inputs, key) && inputs[key] != null) {
            values[key] = String(inputs[key]);
          }
        }
      }
      return new Promise(function (resolve) {
        waiting[id] = resolve;
        var sent = post({ lpmRun: { id: id, action: String(action == null ? "" : action), inputs: values } });
        if (!sent) settle(id, { error: "This page can't run actions here." });
      });
    },
    refresh: function () {
      post({ lpmRefresh: true });
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

  function reply(answer) {
    if (answer && typeof answer === "object") settle(String(answer.id), answer);
  }

  Object.defineProperty(window, "lpm", { value: lpm });
  Object.defineProperty(window, "__lpmPush", { value: push });
  Object.defineProperty(window, "__lpmReply", { value: reply });
  window.addEventListener("message", function (event) {
    if (window.parent === window || event.source !== window.parent) return;
    if (event.data && event.data.lpmPopup) push(event.data.lpmPopup);
    if (event.data && event.data.lpmReply) reply(event.data.lpmReply);
  });
  applyTheme();
  document.addEventListener("DOMContentLoaded", applyTheme);
})(__LPM_POPUP_PAYLOAD__);
