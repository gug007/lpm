import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NotesReadFileAsInput } from "../../bridge/commands";

const GAP = 8;
const EDGE_MARGIN = 8;

// Data URLs are reused across hovers so re-previewing the same image doesn't
// re-read it from disk. Bounded LRU: base64 data URLs are large, and the
// composer is a long-lived singleton, so an unbounded cache would leak.
const MAX_CACHE_ENTRIES = 12;
const urlCache = new Map<string, string>();

function cacheGet(path: string): string | undefined {
  const url = urlCache.get(path);
  if (url !== undefined) {
    urlCache.delete(path);
    urlCache.set(path, url);
  }
  return url;
}

function cacheSet(path: string, url: string) {
  urlCache.delete(path);
  urlCache.set(path, url);
  while (urlCache.size > MAX_CACHE_ENTRIES) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    urlCache.delete(oldest);
  }
}

interface ImagePreviewPopoverProps {
  path: string;
  anchor: DOMRect;
}

export function ImagePreviewPopover({ path, anchor }: ImagePreviewPopoverProps) {
  const [url, setUrl] = useState<string | null>(() => cacheGet(path) ?? null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cached = cacheGet(path);
    if (cached) {
      setUrl(cached);
      return;
    }
    let cancelled = false;
    setFailed(false);
    NotesReadFileAsInput(path)
      .then((input: { mimeType?: string; data: string }) => {
        const dataUrl = `data:${input.mimeType || "image/png"};base64,${input.data}`;
        cacheSet(path, dataUrl);
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let top = anchor.top - box.height - GAP;
    if (top < EDGE_MARGIN) top = anchor.bottom + GAP;
    let left = anchor.left + anchor.width / 2 - box.width / 2;
    left = Math.max(EDGE_MARGIN, Math.min(left, window.innerWidth - EDGE_MARGIN - box.width));
    top = Math.max(EDGE_MARGIN, Math.min(top, window.innerHeight - EDGE_MARGIN - box.height));
    setPos({ top, left });
  }, [url, anchor]);

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="pointer-events-none fixed z-[9999] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
    >
      {url ? (
        <img src={url} alt="" className="block max-h-[220px] max-w-[260px] rounded object-contain" />
      ) : failed ? (
        <div className="flex h-16 w-24 items-center justify-center px-2 text-center text-[11px] text-[var(--text-muted)]">
          Preview unavailable
        </div>
      ) : (
        <div className="flex h-16 w-24 items-center justify-center text-[11px] text-[var(--text-muted)]">
          Loading…
        </div>
      )}
    </div>,
    document.body,
  );
}
