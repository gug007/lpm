import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { PopupViewClose, PopupViewOpen, PopupViewPlace, PopupViewPush } from "../../bridge/commands";
import { popupDocument } from "./popupDocument";
import { hexColor } from "./popupTheme";
import type { PopupPageProps } from "./popupTypes";
import { useFollowRect, type Rect } from "./useFollowRect";
import { usePagePayload } from "./usePagePayload";

// The page in a webview of its own laid over this frame (macOS and Windows), so
// a page that hangs or crashes can't take the app with it.
export function NativePopupFrame({ html, base, payload, width, height, onFailure }: PopupPageProps) {
  const holeRef = useRef<HTMLDivElement>(null);
  const failRef = useRef(onFailure);
  failRef.current = onFailure;
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
    let offFailed: (() => void) | null = null;
    void listen<{ id?: string; error?: string }>("popup-view-failed", (event) => {
      if (live && event.payload?.id === id) failRef.current(event.payload.error ?? "The page stopped loading.");
    }).then((off) => {
      if (live) offFailed = off;
      else off();
    });
    PopupViewOpen(
      id,
      popupDocument(html, first, base),
      r.left,
      r.top,
      r.width,
      r.height,
      hexColor(first.theme.colors.bg ?? ""),
    ).then(
      () => live && setOpened(id),
      (err: unknown) => live && failRef.current(`Couldn't open the page: ${err}`),
    );
    return () => {
      live = false;
      offFailed?.();
      setOpened(null);
      void PopupViewClose(id).catch(() => {});
    };
  }, [html, base, first]);

  const follow = useCallback(
    (rect: Rect) => {
      if (opened) void PopupViewPlace(opened, rect.x, rect.y, rect.width, rect.height).catch(() => {});
    },
    [opened],
  );
  useFollowRect(holeRef, follow);

  return <div ref={holeRef} style={{ width, height }} />;
}
