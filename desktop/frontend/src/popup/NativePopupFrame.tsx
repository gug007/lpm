import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  PopupViewClose,
  PopupViewOpen,
  PopupViewPlace,
  PopupViewPush,
  PopupViewReply,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { isWindows } from "../platform";
import { popupDocument } from "./popupDocument";
import { hexColor } from "./popupTheme";
import type { PopupPageProps } from "./popupTypes";
import { useFollowRect, type Rect } from "./useFollowRect";
import { usePageAsks } from "./usePageAsks";
import { usePagePayload } from "./usePagePayload";

// Where an app's page waits while its tab is out of view (see browser.rs).
const PARKED = -32000;
// WebView2 only routes a custom scheme as http://<scheme>.localhost/. A page
// posts to its own id there, which a frame inside it can't read.
const PAGE_POST = isWindows ? "http://lpm-page.localhost/" : "lpm-page://localhost/";

function parked(size: Rect): Rect {
  return { ...size, x: PARKED, y: PARKED };
}

// The page in a webview of its own laid over this frame (macOS and Windows), so
// a page that hangs or crashes can't take the app with it.
export function NativePopupFrame({
  html,
  base,
  payload,
  width,
  height,
  shown = true,
  onFailure,
  onRefresh,
}: PopupPageProps) {
  const holeRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  // The size the page last had on screen, kept while it's parked.
  const sizeRef = useRef<Rect | null>(null);
  const push = useMemo(
    () =>
      opened
        ? (next: unknown) => void PopupViewPush(opened, JSON.stringify(next)).catch(() => {})
        : null,
    [opened],
  );
  const first = usePagePayload(html, base, payload, push);
  const onAsk = usePageAsks(onRefresh);

  useEffect(() => {
    const hole = holeRef.current;
    if (!hole) return;
    // A tab's page outlives the cards that open while it's up (see popup_view.rs).
    const id = (first.view === "tab" ? "tab-" : "") + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const r = hole.getBoundingClientRect();
    const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
    sizeRef.current = rect;
    let live = true;
    // A page that never finishes loading (its script stuck) is closed by the app.
    const offFailed = EventsOn("popup-view-failed", (failed?: { id?: string; error?: string }) => {
      if (failed?.id === id) onFailure(failed.error ?? "The page stopped loading.");
    });
    const offAsked = EventsOn("popup-view-message", (asked?: { id?: string; message?: unknown }) => {
      if (asked?.id !== id) return;
      onAsk(asked.message, (reply) => void PopupViewReply(id, JSON.stringify(reply)).catch(() => {}));
    });
    PopupViewOpen(
      id,
      popupDocument(html, { ...first, post: PAGE_POST + id }, base),
      shownRef.current ? rect : parked(rect),
      hexColor(first.theme.colors.bg),
    ).then(
      () => live && setOpened(id),
      (err: unknown) => live && onFailure(`Couldn't open the page: ${err}`),
    );
    return () => {
      live = false;
      offFailed();
      offAsked();
      setOpened(null);
      void PopupViewClose(id).catch(() => {});
    };
  }, [html, base, first, onFailure, onAsk]);

  useEffect(() => {
    if (opened && !shown && sizeRef.current) {
      void PopupViewPlace(opened, parked(sizeRef.current)).catch(() => {});
    }
  }, [opened, shown]);

  const follow = useCallback(
    (rect: Rect) => {
      if (!opened || !shown || rect.width === 0 || rect.height === 0) return;
      sizeRef.current = rect;
      void PopupViewPlace(opened, rect).catch(() => {});
    },
    [opened, shown],
  );
  useFollowRect(holeRef, follow);

  return <div ref={holeRef} style={{ width, height }} />;
}
