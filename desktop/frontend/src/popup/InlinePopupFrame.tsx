import { useCallback, useMemo, useRef } from "react";
import { popupDocument } from "./popupDocument";
import type { PopupPageProps } from "./popupTypes";
import { usePagePayload } from "./usePagePayload";

// The page in a sandboxed frame, where there's no webview to lay over the app:
// Linux (see browser.rs).
export function InlinePopupFrame({ html, base, payload, width, height }: PopupPageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const push = useCallback((next: unknown) => {
    frameRef.current?.contentWindow?.postMessage({ lpmPopup: next }, "*");
  }, []);
  const first = usePagePayload(html, base, payload, push);
  const doc = useMemo(() => popupDocument(html, first, base), [html, first, base]);

  return (
    <iframe
      ref={frameRef}
      title="Action popup"
      srcDoc={doc}
      sandbox="allow-scripts"
      style={{ width, height }}
      className="block border-0 bg-transparent"
    />
  );
}
