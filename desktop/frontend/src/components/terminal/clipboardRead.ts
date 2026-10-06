import { isWindows } from "../../platform";

export type ClipboardContent =
  | { kind: "image"; blob: Blob; mimeType: string }
  | { kind: "text"; text: string };

type Reader = {
  read?: () => Promise<ClipboardItems>;
  readText?: () => Promise<string>;
};

// Reads the clipboard for a keyboard paste that has no native paste event
// behind it (Ctrl+Shift+V off macOS): an image wins over text, the way a ⌘V
// paste event is handled; `fallbackText` covers webviews that refuse the
// async Clipboard API.
export async function readClipboardContent(
  fallbackText: () => Promise<string>,
  clipboard: Reader | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
  readImage?: () => Promise<ClipboardContent | null>,
): Promise<ClipboardContent | null> {
  if (clipboard?.read) {
    try {
      const items = await clipboard.read();
      let textItem: ClipboardItem | null = null;
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) return { kind: "image", blob: await item.getType(imageType), mimeType: imageType };
        if (!textItem && item.types.includes("text/plain")) textItem = item;
      }
      if (textItem) {
        const text = await (await textItem.getType("text/plain")).text();
        if (text) return { kind: "text", text };
      }
    } catch {
      // Permission refused or unsupported type — try plain text below.
    }
  }
  if (readImage) {
    const image = await readImage().catch(() => null);
    if (image) return image;
  }
  if (clipboard?.readText) {
    try {
      const text = await clipboard.readText();
      if (text) return { kind: "text", text };
    } catch {
      // Fall through to the backend read.
    }
  }
  try {
    const text = await fallbackText();
    return text ? { kind: "text", text } : null;
  } catch {
    return null;
  }
}

export type PasteContent = ClipboardContent | { kind: "files"; paths: string[] };

// Everything such a paste can carry: copied files win (as their paths), then
// what readClipboardContent finds. `readText` is the backend's uncapped read,
// so a long clipboard is never pasted cut short. Both reads start at once,
// while the keypress still counts as a user gesture.
export async function readPasteContent(
  readFiles: () => Promise<unknown>,
  readText: () => Promise<unknown>,
  clipboard: Reader | undefined = typeof navigator === "undefined" ? undefined : navigator.clipboard,
  readImage?: () => Promise<ClipboardContent | null>,
): Promise<PasteContent | null> {
  const content = readClipboardContent(
    () => readText().then((text) => (typeof text === "string" ? text : "")),
    clipboard,
    readImage,
  );
  const paths = await readFiles().catch(() => null);
  if (Array.isArray(paths) && paths.length > 0) return { kind: "files", paths };
  return content;
}

// WebKitGTK refuses the async Clipboard API and its paste events carry no
// image, so on Linux an image comes from the backend's own clipboard read,
// which answers { mimeType, b64Data } or null.
export async function readBackendImage(
  read: () => Promise<unknown>,
): Promise<ClipboardContent | null> {
  const image = (await read()) as { mimeType?: unknown; b64Data?: unknown } | null;
  if (!image || typeof image.mimeType !== "string" || typeof image.b64Data !== "string") return null;
  const bytes = Uint8Array.from(atob(image.b64Data), (c) => c.charCodeAt(0));
  return { kind: "image", blob: new Blob([bytes], { type: image.mimeType }), mimeType: image.mimeType };
}

// Runs `fallback` once the current keydown's default action is over, unless it
// delivered a paste event to `target`. Chromium pastes Ctrl+Shift+V natively as
// plain text; WebKitGTK binds nothing to it, so there the paste is up to us.
// Chromium's plain-text paste of a clipboard holding only an image arrives
// empty, so on Windows an empty paste event leaves the paste to us too.
export function unlessNativePaste(
  target: EventTarget,
  fallback: () => void,
  emptyIsNative: boolean = !isWindows,
): void {
  let pasted = false;
  const seen = (e: Event) => {
    const carried = ((e as ClipboardEvent).clipboardData?.types.length ?? 0) > 0;
    if (carried || emptyIsNative) pasted = true;
  };
  target.addEventListener("paste", seen, { capture: true, once: true });
  setTimeout(() => {
    target.removeEventListener("paste", seen, { capture: true });
    if (!pasted) fallback();
  }, 0);
}
