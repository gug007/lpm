import { useEffect, useState } from "react";
import { NotesReadFileAsInput } from "../../bridge/commands";
import { PEER_UPLOAD_MAX_BYTES, prefixRoot } from "../peer/markers";

// Data URLs are reused across previews so re-opening the same image doesn't
// re-read it from disk. Bounded LRU: base64 data URLs are large and the composer
// is a long-lived singleton, so an unbounded cache would leak.
const MAX_CACHE_ENTRIES = 12;
const urlCache = new Map<string, string>();

function cacheGet(key: string): string | undefined {
  const url = urlCache.get(key);
  if (url !== undefined) {
    urlCache.delete(key);
    urlCache.set(key, url);
  }
  return url;
}

function cacheSet(key: string, url: string) {
  urlCache.delete(key);
  urlCache.set(key, url);
  while (urlCache.size > MAX_CACHE_ENTRIES) {
    const oldest = urlCache.keys().next().value;
    if (oldest === undefined) break;
    urlCache.delete(oldest);
  }
}

// The key a path is read and cached under. An attachment of a peer terminal sits
// on that host's disk, so it is read as a peer-marked root and the command router
// forwards the read there; unmarked, the host path would be looked up on THIS
// machine, which has nothing at it. The marker also keeps two hosts' identically
// named temp files apart in the cache. `slug` is absent for a local file.
function readKey(path: string, slug?: string | null): string {
  return slug && path.startsWith("/") ? prefixRoot(slug, path) : path;
}

// Seat bytes already in hand — a peer image is uploaded FROM here, so its pixels
// are known before the host path exists — so every later reader of that path (a
// chip rebuilt from a draft, the hover preview, the lightbox) is served without a
// round trip to the host.
export function seedImageDataUrl(
  path: string,
  slug: string | null,
  dataUrl: string,
): void {
  cacheSet(readKey(path, slug), dataUrl);
}

// Read an image as a base64 data URL, served from the shared LRU cache so a
// thumbnail chip, its hover preview, and the click-to-open lightbox of the same
// file each read disk at most once. Imperative form, for the chip thumbnails
// rendered into the contenteditable outside React.
export function loadImageDataUrl(
  path: string,
  slug?: string | null,
): Promise<string> {
  const key = readKey(path, slug);
  const cached = cacheGet(key);
  if (cached) return Promise.resolve(cached);
  // A routed read comes back as one frame over the peer link, so it is capped
  // where an upload is; past that the chip keeps its placeholder glyph.
  const read =
    key === path
      ? NotesReadFileAsInput(key)
      : NotesReadFileAsInput(key, PEER_UPLOAD_MAX_BYTES);
  return read.then((input: { mimeType?: string; data: string }) => {
    const dataUrl = `data:${input.mimeType || "image/png"};base64,${input.data}`;
    cacheSet(key, dataUrl);
    return dataUrl;
  });
}

// Hook form of the same loader. `url` holds the previous value until a new
// (uncached) path resolves — no blank flash between previews; `failed` flips
// when the read errors.
export function useImageDataUrl(
  path: string,
  slug?: string | null,
): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(
    () => cacheGet(readKey(path, slug)) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const cached = cacheGet(readKey(path, slug));
    if (cached) {
      setUrl(cached);
      setFailed(false);
      return;
    }
    let cancelled = false;
    setFailed(false);
    loadImageDataUrl(path, slug)
      .then((dataUrl) => {
        if (!cancelled) setUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [path, slug]);

  return { url, failed };
}
