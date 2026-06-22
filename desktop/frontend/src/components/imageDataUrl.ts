import { useEffect, useState } from "react";
import { NotesReadFileAsInput } from "../../bridge/commands";

// Data URLs are reused across previews so re-opening the same image doesn't
// re-read it from disk. Bounded LRU: base64 data URLs are large and the composer
// is a long-lived singleton, so an unbounded cache would leak.
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

// Read a local image as a base64 data URL, served from a shared LRU cache so a
// hover preview and a click-to-open lightbox of the same file each read disk at
// most once. `url` holds the previous value until a new (uncached) path resolves
// — no blank flash between previews; `failed` flips when the read errors.
export function useImageDataUrl(path: string): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(() => cacheGet(path) ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = cacheGet(path);
    if (cached) {
      setUrl(cached);
      setFailed(false);
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

  return { url, failed };
}
