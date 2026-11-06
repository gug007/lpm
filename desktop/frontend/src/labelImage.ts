import type { PopupTheme } from "./popup/popupTypes";

// An action's `labelSvg` as the image its button shows: an `<svg>`, drawn as
// written. As an image nothing in it runs, loads or reaches the app's styles,
// and it can't grow past the button; scripts, handlers and URLs are taken out
// besides. Anything else, or one too big or that doesn't parse, gives null, and
// the button shows its text label.
const MAX_MARKUP = 32 * 1024;
const SVG_NS = "http://www.w3.org/2000/svg";
const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif`;

function themeStyle(theme: PopupTheme): string {
  const vars = Object.entries(theme.colors).map(([name, value]) => `--lpm-${name}:${value}`);
  return [...vars, `color:${theme.colors.text ?? "#e5e5e5"}`, `font:600 12px ${FONT}`].join(";");
}

function scrub(root: Element) {
  root.querySelectorAll("script,iframe,object,embed,link,meta,base").forEach((el) => el.remove());
  for (const el of [root, ...root.querySelectorAll("*")]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      const reaches =
        name.startsWith("on") ||
        name === "src" ||
        name === "srcset" ||
        name === "href" ||
        name.endsWith(":href") ||
        (name === "style" && /url\s*\(|@import/i.test(attr.value));
      if (reaches) el.removeAttribute(attr.name);
    }
  }
  root.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent ?? "").replace(/@import[^;]*;?/gi, "").replace(/url\s*\([^)]*\)/gi, "none");
  });
}

function dataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function svgImage(markup: string, theme: PopupTheme): string | null {
  const namespaced = /^<svg\b[^>]*\bxmlns=/i.test(markup) ? markup : markup.replace(/^<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  const doc = new DOMParser().parseFromString(namespaced, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.localName !== "svg" || doc.getElementsByTagName("parsererror").length) return null;
  scrub(svg);
  svg.setAttribute("style", `${themeStyle(theme)};${svg.getAttribute("style") ?? ""}`);
  return dataUrl(new XMLSerializer().serializeToString(svg));
}

export function labelImage(markup: string, theme: PopupTheme): string | null {
  const trimmed = markup.trim();
  if (!/^<svg\b/i.test(trimmed) || trimmed.length > MAX_MARKUP) return null;
  try {
    return svgImage(trimmed, theme);
  } catch {
    return null;
  }
}
