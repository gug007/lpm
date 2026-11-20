import { useCallback, useMemo, useRef } from "react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { useEventListener } from "../hooks/useEventListener";
import { popupDocument } from "./popupDocument";
import type { PopupPageProps } from "./popupTypes";
import { usePageAsks } from "./usePageAsks";
import { usePagePayload } from "./usePagePayload";

// The page in a sandboxed frame, where there's no webview to lay over the app:
// Linux (see browser.rs), and a project's own window.
export function InlinePopupFrame({ html, base, payload, width, height, onRefresh }: PopupPageProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const push = useCallback((next: unknown) => {
    frameRef.current?.contentWindow?.postMessage({ lpmPopup: next }, "*");
  }, []);
  const first = usePagePayload(html, base, payload, push);
  const doc = useMemo(() => popupDocument(html, first, base), [html, first, base]);
  const onAsk = usePageAsks(onRefresh);

  // The frame can't open a window, so `lpm.open` and its links ask here, as
  // its runs and refreshes do.
  useEventListener("message", (event: MessageEvent) => {
    const page = frameRef.current?.contentWindow;
    if (!page || event.source !== page) return;
    const url = (event.data as { lpmOpen?: unknown } | null)?.lpmOpen;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) BrowserOpenURL(url);
    onAsk(event.data, (reply) => page.postMessage({ lpmReply: reply }, "*"));
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
