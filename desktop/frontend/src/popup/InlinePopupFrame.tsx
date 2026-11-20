import { useCallback, useMemo, useRef } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useEventListener } from "../hooks/useEventListener";
import { popupDocument } from "./popupDocument";
import type { PopupPageProps } from "./popupTypes";
import { usePagePayload } from "./usePagePayload";

// The page in a sandboxed frame, where there's no webview to lay over the app:
// Linux (see browser.rs), and a project's own window.
export function InlinePopupFrame({ html, base, payload, width, height }: PopupPageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const push = useCallback((next: unknown) => {
    frameRef.current?.contentWindow?.postMessage({ lpmPopup: next }, "*");
  }, []);
  const first = usePagePayload(html, base, payload, push);
  const doc = useMemo(() => popupDocument(html, first, base), [html, first, base]);

  // The frame can't open a window, so `lpm.open` and its links ask here.
  useEventListener("message", (event: MessageEvent) => {
    if (event.source !== frameRef.current?.contentWindow) return;
    const url = (event.data as { lpmOpen?: unknown } | null)?.lpmOpen;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) BrowserOpenURL(url);
  });

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
