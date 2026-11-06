import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PopupViewClose, PopupViewOpen, PopupViewPlace, PopupViewPush } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { popupDocument } from "./popupDocument";
import { hexColor } from "./popupTheme";
import type { PopupPageProps } from "./popupTypes";
import { useFollowRect, type Rect } from "./useFollowRect";
import { usePagePayload } from "./usePagePayload";

// The page in a webview of its own laid over this frame (macOS and Windows), so
// a page that hangs or crashes can't take the app with it.
export function NativePopupFrame({ html, base, payload, width, height, onFailure }: PopupPageProps) {
  const holeRef = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<string | null>(null);
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
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    const r = hole.getBoundingClientRect();
    let live = true;
    // A page that never finishes loading (its script stuck) is closed by the app.
    const offFailed = EventsOn("popup-view-failed", (failed?: { id?: string; error?: string }) => {
      if (failed?.id === id) onFailure(failed.error ?? "The page stopped loading.");
    });
    PopupViewOpen(
      id,
      popupDocument(html, first, base),
      { x: r.left, y: r.top, width: r.width, height: r.height },
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

  const follow = useCallback(
    (rect: Rect) => {
      if (opened) void PopupViewPlace(opened, rect).catch(() => {});
    },
    [opened],
  );
  useFollowRect(holeRef, follow);

  return <div ref={holeRef} style={{ width, height }} />;
}
