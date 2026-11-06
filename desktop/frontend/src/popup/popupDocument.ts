import bootstrap from "../../../../mobile/shared/web/popup/bootstrap.js?raw";
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
// same one the phones inject. Its header names the token too, so this takes the
// last, as they do.
function bootstrapScript(payload: PopupPayload): string {
  const at = bootstrap.lastIndexOf(PAYLOAD_TOKEN);
  return bootstrap.slice(0, at) + scriptJson(payload) + bootstrap.slice(at + PAYLOAD_TOKEN.length);
}

// Puts `snippet` first in the page's head, adding one where it has none.
export function injectHead(html: string, snippet: string): string {
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  const root = /<html(\s[^>]*)?>/i.exec(html);
  if (root) {
    const at = root.index + root[0].length;
    return `${html.slice(0, at)}<head>${snippet}</head>${html.slice(at)}`;
  }
  const doctype = /<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const at = doctype.index + doctype[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }
  return snippet + html;
}

// The popup's page as the card loads it: `<base>` so its own files load from
// beside it, lpm's colors as a default the page's styles override, and the
// bootstrap with the first data.
export function popupDocument(html: string, payload: PopupPayload, baseHref?: string): string {
  const colors = payload.theme.colors;
  const snippet = [
    baseHref ? `<base href="${escapeAttr(baseHref)}">` : "",
    `<style>:where(html){background:${colors.bg ?? "transparent"};color:${colors.text ?? "inherit"};` +
      `font:12px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}:where(body){margin:0}</style>`,
    `<script>${bootstrapScript(payload)}${LINKS}</script>`,
  ].join("");
  return injectHead(html, snippet);
}
