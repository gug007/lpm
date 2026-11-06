import bootstrap from "../../../../mobile/shared/web/popup/bootstrap.js?raw";
import { POPUP_FONT } from "./popupTheme";
import type { PopupPayload } from "./popupTypes";

const PAYLOAD_TOKEN = "__LPM_POPUP_PAYLOAD__";

// Desktop only: a link click opens in the browser instead of replacing the page
// inside the card.
const LINKS = `document.addEventListener("click", function (event) {
  var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
  if (!link || link.getAttribute("href").charAt(0) === "#" || !/^https?:/i.test(link.href)) return;
  event.preventDefault();
  window.open(link.href, "_blank");
}, true);`;

// JSON that stays one script: no "</script>" or line separator can end it early.
export function scriptJson(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// The script that runs before a popup page's own and gives it `window.lpm`, the
// same one the phones inject.
function bootstrapScript(payload: PopupPayload): string {
  return bootstrap.replace(PAYLOAD_TOKEN, () => scriptJson(payload));
}

// Puts `snippet` first in the page's head, or where one would start: the parser
// opens it for what's in the snippet.
export function injectHead(html: string, snippet: string): string {
  const opening = /<head(\s[^>]*)?>/i.exec(html) ?? /<html(\s[^>]*)?>/i.exec(html) ?? /<!doctype[^>]*>/i.exec(html);
  const at = opening ? opening.index + opening[0].length : 0;
  return html.slice(0, at) + snippet + html.slice(at);
}

// The popup's page as the card loads it: `<base>` so its own files load from
// beside it, lpm's colors as a default the page's styles override, and the
// bootstrap with the first data.
export function popupDocument(html: string, payload: PopupPayload, baseHref?: string): string {
  const colors = payload.theme.colors;
  const snippet = [
    baseHref ? `<base href="${escapeAttr(baseHref)}">` : "",
    `<style>:where(html){background:${colors.bg};color:${colors.text};font:12px ${POPUP_FONT}}` +
      `:where(body){margin:0}</style>`,
    `<script>${bootstrapScript(payload)}${LINKS}</script>`,
  ].join("");
  return injectHead(html, snippet);
}
