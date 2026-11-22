import { useHtmlPreviewSrc } from "../components/htmlPreview";
import { IS_MIRROR_WINDOW } from "../mirror";
import { isLinux } from "../platform";
import { InlinePopupFrame } from "./InlinePopupFrame";
import { NativePopupFrame } from "./NativePopupFrame";
import type { PopupPageProps } from "./popupTypes";

declare global {
  interface Window {
    // The browser demo, which has no webview of its own to lay over the app.
    __LPM_INLINE_PAGES__?: boolean;
  }
}

// A popup page, with its own files beside it when it has a file on this Mac.
export function PopupFrame({ file, ...page }: Omit<PopupPageProps, "base"> & { file?: string }) {
  const base = useHtmlPreviewSrc(file);
  if (base === undefined) return <div style={{ width: page.width, height: page.height }} />;
  // macOS and Windows draw the page in a webview of its own over the frame.
  // Linux has no webview over the app, and the webview belongs to the main
  // window, so a project's own window draws the page in its frame too.
  const inline = isLinux || IS_MIRROR_WINDOW || window.__LPM_INLINE_PAGES__;
  const Frame = inline ? InlinePopupFrame : NativePopupFrame;
  return <Frame {...page} base={base ?? undefined} />;
}
