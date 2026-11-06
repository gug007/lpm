import { useHtmlPreviewSrc } from "../components/htmlPreview";
import { isLinux } from "../platform";
import { InlinePopupFrame } from "./InlinePopupFrame";
import { NativePopupFrame } from "./NativePopupFrame";
import type { PopupPageProps } from "./popupTypes";

// macOS and Windows draw the page in a webview of its own over the frame; Linux
// has no webview over the app, and the demo no native side.
const NATIVE = !isLinux && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

// A popup page, with its own files beside it when it has a file on this Mac.
export function PopupFrame({ file, ...page }: Omit<PopupPageProps, "base"> & { file?: string }) {
  const base = useHtmlPreviewSrc(file);
  if (base === undefined) return <div style={{ width: page.width, height: page.height }} />;
  const Frame = NATIVE ? NativePopupFrame : InlinePopupFrame;
  return <Frame {...page} base={base ?? undefined} />;
}
