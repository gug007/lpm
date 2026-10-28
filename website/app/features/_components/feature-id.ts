export const OPEN_SEARCH_EVENT = "features:open-search";
export const REVEAL_EVENT = "features:reveal";

export function featureId(title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `f-${slug}`;
}

export function openFeatureSearch(query = "") {
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT, { detail: query }));
}

// Unfolds the feature's list if it sits past the fold, then brings it into
// view and rings it, so a search result or a shared #f- link lands on it.
export function jumpToFeature(id: string, areaId: string, smooth: boolean) {
  window.dispatchEvent(new CustomEvent(REVEAL_EVENT, { detail: areaId }));
  const target = document.getElementById(id);
  if (!target) return;
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => {
    target.scrollIntoView({
      block: "center",
      behavior: smooth && !reduceMotion ? "smooth" : "auto",
    });
    target.removeAttribute("data-flash");
    void target.offsetWidth;
    target.setAttribute("data-flash", "");
    window.setTimeout(() => target.removeAttribute("data-flash"), 2200);
  });
}
