const HIDE_AFTER_MS = 800;

// WebKit's legacy scrollbars can't auto-hide via CSS alone, so mark whichever
// element is actively scrolling and let globals.css show the thumb only while
// the mark is present — the macOS "show when scrolling" behavior.
export function initScrollbarFade(): void {
  const timers = new WeakMap<Element, number>();
  document.addEventListener(
    "scroll",
    (e) => {
      const el =
        e.target instanceof Element ? e.target : document.documentElement;
      el.setAttribute("data-scrolling", "");
      const prev = timers.get(el);
      if (prev !== undefined) window.clearTimeout(prev);
      timers.set(
        el,
        window.setTimeout(() => {
          el.removeAttribute("data-scrolling");
          timers.delete(el);
        }, HIDE_AFTER_MS),
      );
    },
    { capture: true, passive: true },
  );
}
