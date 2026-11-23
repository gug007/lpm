// Injected into a browser tab's page by browser_pick.rs. The page can't call
// the app, so the answer waits on the page (window[KEY].take()) until the app
// reads it. Everything drawn sits in a closed shadow root, styled inline, so
// the page's CSS, CSP and Trusted Types leave it alone.
(() => {
  const KEY = __LPM_PICK_KEY__;
  if (window[KEY]) return;
  const W = window;
  const D = document;
  const stringify = JSON.stringify;
  const ACCENT = "#22d3ee";
  const MIN_AREA = 6;
  let result = null;
  let finished = false;
  let hovered = null;
  let drag = null;

  const clip = (value, max) => {
    const s = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  };
  const css = (el, rules) => {
    for (const k in rules) el.style.setProperty(k, rules[k], "important");
  };

  const host = D.createElement("div");
  css(host, { position: "fixed", top: "0", left: "0", width: "0", height: "0", margin: "0", padding: "0", border: "0", "z-index": "2147483647", "pointer-events": "none" });
  const shadow = host.attachShadow({ mode: "closed" });
  const box = D.createElement("div");
  const area = D.createElement("div");
  const label = D.createElement("div");
  const hint = D.createElement("div");
  const fixed = { position: "fixed", display: "none", "box-sizing": "border-box", "pointer-events": "none", margin: "0" };
  css(box, { ...fixed, border: `2px solid ${ACCENT}`, background: "rgba(34,211,238,0.12)", "border-radius": "3px" });
  css(area, { ...fixed, border: `2px dashed ${ACCENT}`, background: "rgba(34,211,238,0.10)" });
  css(label, { ...fixed, font: "11px/16px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace", color: "#fff", background: "#0e7490", padding: "2px 6px", "border-radius": "4px", "white-space": "nowrap", "max-width": "70vw", overflow: "hidden", "text-overflow": "ellipsis" });
  css(hint, { ...fixed, display: "block", top: "10px", left: "50%", transform: "translateX(-50%)", font: "12px/18px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", color: "#e5e5e5", background: "rgba(26,26,26,0.94)", border: "1px solid #3a3a3a", padding: "5px 10px", "border-radius": "8px", "white-space": "nowrap", "max-width": "calc(100vw - 20px)", overflow: "hidden", "text-overflow": "ellipsis" });
  hint.textContent = "Click to send an element to the agent · Shift-drag for an area · Esc to cancel";
  shadow.append(box, area, label, hint);

  const fileOf = (raw) => {
    if (!raw) return null;
    let s = String(raw);
    s = s.replace(/^webpack-internal:\/\/\/(\([^)]*\)\/)?/, "").replace(/^\.\//, "");
    try {
      const u = new URL(s);
      if (u.protocol === "http:" || u.protocol === "https:") s = u.pathname;
      else if (u.protocol === "file:") s = decodeURIComponent(u.pathname);
    } catch {}
    s = s.replace(/[?#].*$/, "").replace(/^\/@fs\//, "/");
    if (/node_modules|\/\.vite\/deps\/|\/_next\/static\/|react-dom|jsx-dev-runtime|react\.development/.test(s)) return null;
    return s || null;
  };
  const stackFile = (err) => {
    const stack = err && err.stack;
    if (typeof stack !== "string") return null;
    const re = /((?:https?|file|webpack-internal):\/\/[^\s)]+?):(\d+):(\d+)/g;
    let m;
    while ((m = re.exec(stack))) {
      const file = fileOf(m[1]);
      if (file) return file;
    }
    return null;
  };
  const nameOf = (type) => {
    if (!type) return null;
    if (typeof type === "function") return type.displayName || type.name || null;
    if (typeof type === "object") return type.displayName || nameOf(type.render) || nameOf(type.type);
    return null;
  };
  const react = (el) => {
    let node = el;
    let key = null;
    for (let i = 0; node && i < 40 && !key; i++) {
      key = Object.keys(node).find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")) || null;
      if (!key) node = node.parentElement;
    }
    if (!key) return null;
    const host = node[key];
    if (!host) return null;
    const names = [];
    const add = (name) => {
      if (name && !/^(Anonymous|ForwardRef|Memo)$/.test(name) && !names.includes(name)) names.push(name);
    };
    // The owners are the components whose render made the element; the return
    // path also passes through every provider and library wrapper around it.
    for (let o = host._debugOwner, i = 0; o && i < 50 && names.length < 3; o = o._debugOwner || o.owner, i++) {
      add(nameOf(o.type) || (typeof o.name === "string" ? o.name : null));
    }
    for (let f = host.return, i = 0; !names.length && f && i < 300; f = f.return, i++) {
      const t = f.type;
      if (typeof t === "function" || (t && typeof t === "object")) add(nameOf(t));
    }
    const src = host._debugSource;
    let file = src ? fileOf(src.fileName) : null;
    const line = file && src.lineNumber ? src.lineNumber : null;
    if (!file) file = stackFile(host._debugStack);
    return names.length || file ? { framework: "React", names: names.slice(0, 3), file, line } : null;
  };
  const vue = (el) => {
    for (let node = el, i = 0; node && i < 40; node = node.parentElement, i++) {
      let inst = node.__vueParentComponent;
      if (inst) {
        const names = [];
        let file = null;
        for (let j = 0; inst && j < 50 && names.length < 3; inst = inst.parent, j++) {
          const t = inst.type || {};
          const name = t.__name || t.name;
          if (name) names.push(name);
          if (!file && t.__file) file = fileOf(t.__file);
        }
        return { framework: "Vue", names, file, line: null };
      }
      const old = node.__vue__;
      if (old && old.$options) {
        const o = old.$options;
        return { framework: "Vue", names: [o.name || o._componentTag].filter(Boolean), file: fileOf(o.__file), line: null };
      }
    }
    return null;
  };
  const svelte = (el) => {
    for (let node = el, i = 0; node && i < 40; node = node.parentElement, i++) {
      const loc = node.__svelte_meta && node.__svelte_meta.loc;
      if (loc && loc.file) return { framework: "Svelte", names: [], file: fileOf(loc.file), line: loc.line || null };
    }
    return null;
  };
  const angular = (el) => {
    const ng = W.ng;
    if (!ng || typeof ng.getOwningComponent !== "function") return null;
    const owner = ng.getOwningComponent(el);
    const name = owner && owner.constructor && owner.constructor.name;
    return name ? { framework: "Angular", names: [name], file: null, line: null } : null;
  };
  const componentOf = (el) => {
    for (const probe of [react, vue, svelte, angular]) {
      try {
        const found = probe(el);
        if (found) {
          found.names = found.names.map((n) => clip(n, 80)).slice(0, 3);
          found.file = found.file ? clip(found.file, 300) : null;
          return found;
        }
      } catch {}
    }
    return null;
  };

  const escape = (s) => (W.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/[^\w-]/g, "\\$&"));
  const unique = (sel) => {
    try {
      return D.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  };
  const classesOf = (el) =>
    Array.from(el.classList || [])
      .filter((c) => /^[A-Za-z_-][\w-]{0,40}$/.test(c) && !/^(css|sc|jsx|svelte|emotion)-|__[A-Za-z0-9]{5,}$/.test(c))
      .slice(0, 2);
  const selectorOf = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id && unique(`#${escape(el.id)}`)) return `#${escape(el.id)}`;
    for (const attr of ["data-testid", "data-test", "data-cy", "name", "aria-label"]) {
      const v = el.getAttribute(attr);
      if (v && v.length < 80) {
        const sel = `${tag}[${attr}="${v.replace(/["\\]/g, "\\$&")}"]`;
        if (unique(sel)) return sel;
      }
    }
    const parts = [];
    for (let node = el, depth = 0; node && node.nodeType === 1 && depth < 12; node = node.parentElement, depth++) {
      if (node === D.documentElement) {
        parts.unshift("html");
        break;
      }
      if (depth > 0 && node.id && unique(`#${escape(node.id)}`)) {
        parts.unshift(`#${escape(node.id)}`);
        break;
      }
      let part = node.tagName.toLowerCase() + classesOf(node).map((c) => `.${escape(c)}`).join("");
      const parent = node.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (unique(parts.join(" > "))) break;
    }
    return parts.join(" > ");
  };
  const textOf = (el) => {
    const tag = el.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
      const type = (el.getAttribute("type") || "").toLowerCase();
      const value = type === "password" || type === "hidden" ? "" : el.value;
      return clip(value || el.getAttribute("placeholder") || el.getAttribute("aria-label"), 160);
    }
    if (tag === "img") return clip(el.getAttribute("alt"), 160);
    return clip(el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("title"), 160);
  };
  const openingTag = (el) => {
    const copy = el.cloneNode(false);
    if (copy.removeAttribute) copy.removeAttribute("value");
    return clip(copy.outerHTML.replace(/<\/[^>]+>$/, ""), 300);
  };
  const rectOf = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) });
  const viewportOf = () => ({ width: W.innerWidth, height: W.innerHeight, scrollX: Math.round(W.scrollX), scrollY: Math.round(W.scrollY) });
  const describe = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${el.id}`;
    for (const c of classesOf(el)) s += `.${c}`;
    return s;
  };

  const elementAt = (x, y) => {
    let el = D.elementFromPoint(x, y);
    for (let i = 0; el && el.shadowRoot && i < 10; i++) {
      const inner = el.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === el) break;
      el = inner;
    }
    return el && el !== host && el !== D.documentElement ? el : null;
  };
  const place = (el, r) => css(el, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  const show = (el) => {
    hovered = el;
    if (!el) {
      css(box, { display: "none" });
      css(label, { display: "none" });
      return;
    }
    const r = el.getBoundingClientRect();
    place(box, r);
    const comp = componentOf(el);
    label.textContent = `${describe(el)}${comp && comp.names[0] ? ` · ${comp.names[0]}` : ""}  ${Math.round(r.width)}×${Math.round(r.height)}`;
    const top = r.top >= 22 ? r.top - 22 : Math.min(r.bottom + 4, W.innerHeight - 22);
    css(label, { display: "block", left: `${Math.max(4, Math.min(r.left, W.innerWidth - 120))}px`, top: `${Math.max(0, top)}px` });
  };
  const areaRect = (e) => {
    const left = Math.min(drag.x, e.clientX);
    const top = Math.min(drag.y, e.clientY);
    return { left, top, width: Math.abs(e.clientX - drag.x), height: Math.abs(e.clientY - drag.y) };
  };

  const handlers = [];
  const on = (type, fn) => {
    handlers.push([type, fn]);
    W.addEventListener(type, fn, true);
  };
  const block = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const teardown = () => {
    for (const [type, fn] of handlers) W.removeEventListener(type, fn, true);
    host.remove();
  };
  const finish = (answer) => {
    if (finished) return;
    finished = true;
    teardown();
    const text = stringify(answer);
    const settle = () => {
      if (result === null) result = text;
    };
    W.requestAnimationFrame(() => W.requestAnimationFrame(settle));
    W.setTimeout(settle, 150);
  };
  const swallowNextClick = () => {
    const eat = (e) => {
      block(e);
      W.removeEventListener("click", eat, true);
    };
    W.addEventListener("click", eat, true);
    W.setTimeout(() => W.removeEventListener("click", eat, true), 500);
  };
  const base = () => ({ url: clip(W.location.href, 2000), title: clip(D.title, 200), viewport: viewportOf() });
  const pickElement = (el) => {
    const r = el.getBoundingClientRect();
    finish({
      ...base(),
      kind: "element",
      tag: el.tagName.toLowerCase(),
      selector: clip(selectorOf(el), 500),
      text: textOf(el),
      html: openingTag(el),
      component: componentOf(el),
      rect: rectOf(r),
    });
  };
  const pickArea = (r) => {
    const center = elementAt(r.left + r.width / 2, r.top + r.height / 2);
    finish({ ...base(), kind: "area", selector: center ? clip(selectorOf(center), 500) : null, component: center ? componentOf(center) : null, rect: rectOf(r) });
  };

  // Pointer events, not mouse events: cancelling pointerdown (which keeps the
  // page from reacting) also stops the engine sending mousedown and mouseup.
  on("pointermove", (e) => {
    if (drag) {
      place(area, areaRect(e));
      return;
    }
    show(elementAt(e.clientX, e.clientY));
  });
  on("scroll", () => {
    if (hovered && !drag) show(hovered);
  });
  for (const type of ["mousedown", "mouseup", "dblclick", "auxclick", "touchstart", "touchend"]) on(type, block);
  on("pointerdown", (e) => {
    block(e);
    if (e.button === 0 && e.shiftKey) {
      drag = { x: e.clientX, y: e.clientY };
      css(box, { display: "none" });
      css(label, { display: "none" });
      place(area, { left: e.clientX, top: e.clientY, width: 0, height: 0 });
    }
  });
  on("pointerup", (e) => {
    block(e);
    if (!drag) return;
    const r = areaRect(e);
    drag = null;
    css(area, { display: "none" });
    if (r.width >= MIN_AREA && r.height >= MIN_AREA) {
      swallowNextClick();
      pickArea(r);
    }
  });
  on("click", (e) => {
    block(e);
    if (e.button !== 0) return;
    const el = elementAt(e.clientX, e.clientY) || hovered;
    if (el) pickElement(el);
  });
  on("contextmenu", (e) => {
    block(e);
    finish({ cancel: true });
  });
  on("keydown", (e) => {
    if (e.key !== "Escape") return;
    block(e);
    finish({ cancel: true });
  });

  Object.defineProperty(W, KEY, {
    configurable: true,
    enumerable: false,
    value: {
      take() {
        if (result === null) return null;
        delete W[KEY];
        return result;
      },
      stop() {
        if (!finished) {
          finished = true;
          teardown();
        }
        delete W[KEY];
      },
    },
  });
  (D.body || D.documentElement).appendChild(host);
})();
