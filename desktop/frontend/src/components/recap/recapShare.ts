import { CopyPngImage, SavePngImage, SharePngImage } from "../../../bridge/commands";
import { BrowserOpenURL } from "../../../bridge/runtime";
import type { RecapTheme } from "./recapCardTheme";
import { recapImage } from "./recapImage";
import { recapCaption, type RecapView } from "./weeklyRecapModel";

export type RecapNetwork = "x" | "linkedin";

const COMPOSE: Record<RecapNetwork, (caption: string) => string> = {
  x: (caption) => `https://x.com/intent/post?text=${encodeURIComponent(caption)}`,
  linkedin: (caption) =>
    `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(caption)}`,
};

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image"));
    reader.readAsDataURL(blob);
  });
}

const fileName = (view: RecapView) => `${view.title} ${view.range}`;

/** Copies the card as a PNG. The clipboard write starts before the image is
 *  drawn so it stays tied to the click; a webview that refuses it hands the
 *  image to the backend instead. */
export async function copyRecapImage(view: RecapView, theme: RecapTheme): Promise<void> {
  const image = recapImage(view, theme);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
      return;
    } catch {
      // Refused: fall through to the backend.
    }
  }
  await CopyPngImage(await base64(await image));
}

/** Saves the card to Downloads; returns where. */
export async function saveRecapImage(view: RecapView, theme: RecapTheme): Promise<string> {
  return SavePngImage(await base64(await recapImage(view, theme)), fileName(view));
}

/** Hands the card to the system share sheet, pointing from `from`. */
export async function shareRecapImage(
  view: RecapView,
  theme: RecapTheme,
  from: DOMRect,
): Promise<void> {
  const anchor = { x: from.x, y: from.y, width: from.width, height: from.height };
  await SharePngImage(await base64(await recapImage(view, theme)), fileName(view), anchor);
}

/** Opens a new post with the caption. The networks' share links take text,
 *  never an image, so the card goes in by hand: pasted on X, attached as a
 *  file on LinkedIn, whose post box ignores a pasted image. */
export function openRecapPost(view: RecapView, network: RecapNetwork): void {
  BrowserOpenURL(COMPOSE[network](recapCaption(view)));
}
