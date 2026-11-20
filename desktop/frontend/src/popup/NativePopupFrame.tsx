import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PopupViewClose, PopupViewOpen, PopupViewPlace, PopupViewPush } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { popupDocument } from "./popupDocument";
import { hexColor } from "./popupTheme";
import type { PopupPageProps } from "./popupTypes";
import { useFollowRect, type Rect } from "./useFollowRect";
import { usePagePayload } from "./usePagePayload";

// Where an app's page waits while its tab is out of view (see browser.rs).
const PARKED = -32000;

function parked(size: Rect): Rect {
  return { ...size, x: PARKED, y: PARKED };
}

// The page in a webview of its own laid over this frame (macOS and Windows), so
// a page that hangs or crashes can't take the app with it.
export function NativePopupFrame({ html, base, payload, width, height, shown = true, onFailure }: PopupPageProps) {
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
    PopupViewOpen(
      id,
      popupDocument(html, first, base),
      shownRef.current ? rect : parked(rect),
      hexColor(first.theme.colors.bg),
    ).then(
      () => live && setOpened(id),
      (err: unknown) => live && onFailure(`Couldn't open the page: ${err}`),
    );
    return () => {
      live = false;
      offFailed();
      setOpened(null);
      void PopupViewClose(id).catch(() => {});
    };
  }, [html, base, first, onFailure]);

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
