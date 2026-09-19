// Browser-side stage overlay shared by every recording target: the drawn
// cursor and its tap ring, the topic card, and a small locator. `installStage`
// is serialised into the page, so it must stay self-contained.

const OVERLAY_CSS = `
#lesson-card { position: fixed; inset: 0; z-index: 2147483640; isolation: isolate; display: flex; align-items: center; justify-content: center; padding: 0 240px; background: #ebe5d9; color: #141414; font: 600 150px/1.12 "Iowan Old Style", "Palatino", Georgia, serif; letter-spacing: -0.02em; text-align: center; text-wrap: balance; opacity: 0; pointer-events: none; }
#lesson-card > div { position: relative; z-index: 1; }
#lesson-card::before { content: ""; position: absolute; inset: -20%; z-index: 0; filter: blur(60px); background: radial-gradient(40% 50% at 20% 30%, #f2d6c2, transparent 70%), radial-gradient(45% 55% at 80% 70%, #e9dcb6, transparent 70%), radial-gradient(35% 45% at 60% 20%, #d7e0cd, transparent 70%); animation: lesson-drift 26s ease-in-out infinite alternate; }
@keyframes lesson-drift { from { transform: translate(-4%, -3%) rotate(0) scale(1); } to { transform: translate(4%, 3%) rotate(6deg) scale(1.08); } }
#lesson-tick { position: fixed; left: 0; top: 0; width: 1px; height: 1px; pointer-events: none; z-index: 2147483647; opacity: 0.02; animation: lesson-tick 1s linear infinite; }
@keyframes lesson-tick { from { transform: translateX(0); } to { transform: translateX(1px); } }
#lesson-cursor { position: fixed; left: 0; top: 0; z-index: 2147483647; pointer-events: none; width: 40px; height: 40px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.65)); will-change: transform; }
#lesson-ring { position: fixed; left: 0; top: 0; z-index: 2147483646; pointer-events: none; width: 76px; height: 76px; margin: -38px 0 0 -38px; border-radius: 50%; border: 5px solid rgba(255,255,255,.92); opacity: 0; }
`;

const CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.5 3.2v16.3l4.3-4 2.6 5.9 2.9-1.3-2.6-5.8h5.9z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const HOTSPOT = { x: 9, y: 5 };

function installStage({ cursorSvg, hotspot, hiddenText, scale }) {
  const cur = document.createElement("div");
  cur.id = "lesson-cursor";
  cur.innerHTML = cursorSvg;
  const ring = document.createElement("div");
  ring.id = "lesson-ring";
  const card = document.createElement("div");
  card.id = "lesson-card";
  const tick = document.createElement("div");
  tick.id = "lesson-tick";
  document.body.append(card, ring, cur, tick);
  // A native app draws in CSS px = points; the demo page zooms 2x.
  if (scale && scale !== 1) {
    cur.style.width = `${40 / scale}px`;
    cur.style.height = `${40 / scale}px`;
    ring.style.width = `${76 / scale}px`;
    ring.style.height = `${76 / scale}px`;
    ring.style.margin = `${-38 / scale}px 0 0 ${-38 / scale}px`;
    ring.style.borderWidth = `${5 / scale}px`;
    cur.style.filter = `drop-shadow(0 ${1 / scale}px ${1.5 / scale}px rgba(0,0,0,.65))`;
  }
  const hs = { x: hotspot.x / (scale || 1), y: hotspot.y / (scale || 1) };
  const state = { x: 0, y: 0 };
  const place = (x, y) => {
    state.x = x;
    state.y = y;
    cur.style.transform = `translate(${x - hs.x}px, ${y - hs.y}px)`;
  };
  const jerk = (t) => t * t * t * (10 + t * (-15 + 6 * t));
  let covered = false;
  // Inline !important beats the stray animation-level override that has been
  // seen zeroing the card's opacity; it is dropped to a plain value only while
  // a fade runs, then restored and the fade cancelled.
  const setOpacity = (v) => card.style.setProperty("opacity", String(v), "important");
  const fadeCard = (from, to, easing) => {
    card.style.setProperty("opacity", String(from));
    const a = card.animate([{ opacity: from }, { opacity: to }], { duration: 300, easing, fill: "forwards" });
    return a.finished.then(() => {
      setOpacity(to);
      a.cancel();
    });
  };
  setOpacity(0);

  const visible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  const textOf = (el) => (el.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  const smallest = (els) =>
    els.reduce((best, el) => (!best || textOf(el).length < textOf(best).length ? el : best), null);
  // A locator: a CSS selector, `text=<substring>`, `css:has-text("…")`, or a
  // `>>` chain narrowing the scope step by step. Matches must be visible.
  const find = (sel) => {
    let scope = document;
    for (const part of sel.split(">>").map((s) => s.trim())) {
      let el = null;
      const hasText = /^(.*):has-text\("(.*)"\)$/.exec(part);
      if (part.startsWith("text=")) {
        const needle = part.slice(5).trim().toLowerCase();
        const els = [...scope.querySelectorAll("*")].filter((e) => visible(e) && textOf(e).includes(needle));
        el = smallest(els);
      } else if (hasText) {
        const needle = hasText[2].toLowerCase();
        const els = [...scope.querySelectorAll(hasText[1] || "*")].filter((e) => visible(e) && textOf(e).includes(needle));
        el = smallest(els);
      } else {
        el = [...scope.querySelectorAll(part)].find(visible) || null;
      }
      if (!el) return null;
      scope = el;
    }
    return scope;
  };
  const rect = (sel) => {
    const el = find(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const mouseInit = (x, y, extra = {}) => ({
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    screenX: x,
    screenY: y,
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    ...extra,
  });
  const focusable = (el) => el && el.closest && el.closest("input, textarea, select, button, a[href], [tabindex], [contenteditable]");
  const hover = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    el.dispatchEvent(new PointerEvent("pointermove", mouseInit(x, y)));
    el.dispatchEvent(new MouseEvent("mousemove", mouseInit(x, y)));
    el.dispatchEvent(new MouseEvent("mouseover", mouseInit(x, y)));
  };
  const dispatchClick = (x, y) => {
    const el = document.elementFromPoint(x, y);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent("pointerdown", mouseInit(x, y, { buttons: 1 })));
    el.dispatchEvent(new MouseEvent("mousedown", mouseInit(x, y, { buttons: 1 })));
    const f = focusable(el);
    if (f) f.focus();
    el.dispatchEvent(new PointerEvent("pointerup", mouseInit(x, y)));
    el.dispatchEvent(new MouseEvent("mouseup", mouseInit(x, y)));
    el.dispatchEvent(new MouseEvent("click", mouseInit(x, y, { detail: 1 })));
    return true;
  };
  const typeText = (text) => {
    const el = document.activeElement;
    if (el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, el.value + text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return document.execCommand("insertText", false, text);
  };
  const pressKey = (key) => {
    const el = document.activeElement || document.body;
    const init = { key, code: key === "Enter" ? "Enter" : key === "Escape" ? "Escape" : key, bubbles: true, cancelable: true };
    const down = el.dispatchEvent(new KeyboardEvent("keydown", init));
    el.dispatchEvent(new KeyboardEvent("keyup", init));
    if (key === "Enter" && down && el.form) el.form.requestSubmit();
    return true;
  };

  window.__lc = {
    place,
    find: (sel) => !!find(sel),
    rect,
    hover,
    dispatchClick,
    typeText,
    pressKey,
    hideCursor: () => (cur.style.visibility = "hidden"),
    showCursor: () => (cur.style.visibility = ""),
    // Blank card canvas up before the first frame, so a lesson opens on it.
    cover() {
      card.replaceChildren();
      setOpacity(1);
      cur.style.visibility = "hidden";
      covered = true;
    },
    isCovered: () => covered,
    reveal() {
      if (!covered) return Promise.resolve();
      return fadeCard(1, 0, "ease-in").then(() => {
        cur.style.visibility = "";
        covered = false;
      });
    },
    // A topic card: the canvas fades in, the words rise and sharpen one after
    // another, the card holds, then fades out. `hold` leaves it up.
    card(title, ms, hold = false) {
      const fade = 300;
      const perWord = 110;
      const wordMs = 640;
      const inner = document.createElement("div");
      const words = title.split(/\s+/);
      words.forEach((w, i) => {
        const span = document.createElement("span");
        span.textContent = w;
        span.style.cssText = "display:inline-block; opacity:0; will-change:transform,filter,opacity";
        inner.append(span);
        if (i < words.length - 1) inner.append(document.createTextNode(" "));
      });
      card.replaceChildren(inner);
      cur.style.visibility = "hidden";
      const shownAt = covered ? Promise.resolve() : fadeCard(0, 1, "ease-out");
      covered = true;
      const reveals = [...inner.children].map((span, i) =>
        span.animate(
          [
            { opacity: 0, transform: "translateY(0.35em)", filter: "blur(12px)" },
            { opacity: 1, transform: "translateY(0)", filter: "blur(0)" },
          ],
          { duration: wordMs, delay: 140 + i * perWord, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" },
        ),
      );
      const up = Math.max(140 + (words.length - 1) * perWord + wordMs, ms - 2 * fade);
      const shown = shownAt.then(() => new Promise((r) => setTimeout(r, up - fade)));
      if (hold) return shown;
      return shown
        .then(() => fadeCard(1, 0, "ease-in"))
        .then(() => {
          reveals.forEach((a) => a.cancel());
          card.replaceChildren();
          cur.style.visibility = "";
          covered = false;
        });
    },
    moveTo(x, y, ms) {
      const from = { ...state };
      const dx = x - from.x;
      const dy = y - from.y;
      const dist = Math.hypot(dx, dy);
      const bow = Math.min(0.12, 18 / Math.max(dist, 1)) * dist;
      const nx = dist ? -dy / dist : 0;
      const ny = dist ? dx / dist : 0;
      const frames = [];
      for (let i = 0; i <= 32; i++) {
        const t = i / 32;
        const s = jerk(t);
        const b = Math.sin(Math.PI * t) * bow;
        const px = from.x + dx * s + nx * b;
        const py = from.y + dy * s + ny * b;
        frames.push({ transform: `translate(${px - hs.x}px, ${py - hs.y}px)` });
      }
      const anim = cur.animate(frames, { duration: ms, easing: "linear", fill: "forwards" });
      return anim.finished.then(() => {
        anim.commitStyles();
        anim.cancel();
        place(x, y);
      });
    },
    tap() {
      ring.style.left = `${state.x}px`;
      ring.style.top = `${state.y}px`;
      ring.animate(
        [
          { transform: "scale(.35)", opacity: 0.95 },
          { transform: "scale(1.1)", opacity: 0 },
        ],
        { duration: 460, easing: "cubic-bezier(.2,.7,.3,1)" },
      );
      cur.animate(
        [{ transform: `${cur.style.transform} scale(1)` }, { transform: `${cur.style.transform} scale(.86)` }, { transform: `${cur.style.transform} scale(1)` }],
        { duration: 180, easing: "ease-out" },
      );
    },
  };
  const hide = (root) => {
    const els = root.querySelectorAll ? root.querySelectorAll("div, span, p") : [];
    for (const el of els) {
      if (hiddenText.includes(el.textContent?.trim()) && el.children.length === 0) {
        el.style.visibility = "hidden";
      }
    }
  };
  if (hiddenText.length) {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) hide(n);
    }).observe(document.body, { childList: true, subtree: true });
    hide(document.body);
  }
}

module.exports = { OVERLAY_CSS, CURSOR_SVG, HOTSPOT, installStage };
