// Clipboard carrier for composer content with attachments. Copying a selection
// that includes image/file chips writes two flavors: text/plain holds the
// serialized text (chips as `[Image #N]` tokens) for external apps, and
// text/html wraps the same text in a span whose data attribute carries an
// unguessable copy id — so pasting into any lpm composer (including a different
// terminal's) rebuilds the chips. The token→path map itself never touches the
// pasteboard: it lives in the in-app registry below, keyed by that id. That
// keeps local file paths out of what external apps receive, and means clipboard
// HTML can never mint chips for paths the app didn't hand out itself — a forged
// attribute just misses the registry and the paste falls back to plain text.
// The trade-off is that chip pastes only work within one app run.

export const COMPOSER_CLIPBOARD_ATTR = "data-lpm-composer";

export interface ComposerClipboardPayload {
  text: string;
  images: Record<string, string>;
}

// Bounded so abandoned copies don't accumulate paths for the app's lifetime;
// only the most recent copies can still be pasted, which matches how the OS
// clipboard is used.
const REGISTRY_LIMIT = 32;
const registry = new Map<string, ComposerClipboardPayload>();

export function registerCopy(payload: ComposerClipboardPayload): string {
  const id = crypto.randomUUID();
  registry.set(id, payload);
  for (const key of registry.keys()) {
    if (registry.size <= REGISTRY_LIMIT) break;
    registry.delete(key);
  }
  return id;
}

export function lookupCopy(id: string): ComposerClipboardPayload | null {
  return registry.get(id) ?? null;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// pre-wrap so a rich-text target that takes the HTML flavor keeps the line
// breaks and spacing the plain-text flavor would have carried.
export function composerCopyHtml(id: string, text: string): string {
  return (
    `<span style="white-space:pre-wrap" ${COMPOSER_CLIPBOARD_ATTR}="${escapeAttr(id)}">` +
    `${escapeText(text)}</span>`
  );
}

export function writeClipboardPayload(
  dt: DataTransfer,
  payload: ComposerClipboardPayload,
): void {
  dt.setData("text/plain", payload.text);
  dt.setData("text/html", composerCopyHtml(registerCopy(payload), payload.text));
}

// The payload a paste carries, if its HTML flavor came from a composer copy in
// this app run; null for any other clipboard. The text is taken from the
// registry, not the pasted markup, so nothing clipboard-borne is trusted.
export function readClipboardPayload(
  dt: DataTransfer,
): ComposerClipboardPayload | null {
  const html = dt.getData("text/html");
  if (!html || !html.includes(COMPOSER_CLIPBOARD_ATTR)) return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const id = doc
    .querySelector(`[${COMPOSER_CLIPBOARD_ATTR}]`)
    ?.getAttribute(COMPOSER_CLIPBOARD_ATTR);
  return id == null ? null : lookupCopy(id);
}
