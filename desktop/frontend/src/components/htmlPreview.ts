import { useEffect, useState } from "react";
import { HtmlPreviewRoot } from "../../bridge/commands";
import { basename } from "../path";
import { isPeerMarked } from "../peer/markers";
import { isWindows } from "../platform";

export const PREVIEW_SCHEME = "lpm-preview";

const HTML_RE = /\.html?$/i;

export function isHtmlPath(path: string): boolean {
  return HTML_RE.test(path);
}

// The page's URL on the preview scheme: its folder's token, then its name, so
// what it links resolves beside it. WebView2 only routes a custom scheme as
// http://<scheme>.localhost/.
export function previewSrc(token: string, name: string, windows: boolean = isWindows): string {
  const origin = windows ? `http://${PREVIEW_SCHEME}.localhost` : `${PREVIEW_SCHEME}://localhost`;
  return `${origin}/${token}/${encodeURIComponent(name)}`;
}

// Undefined while asking; null for a page this machine doesn't hold, which
// renders from its text.
export function useHtmlPreviewSrc(absPath: string | undefined): string | null | undefined {
  const [src, setSrc] = useState<{ path: string; src: string | null } | null>(null);
  const path = absPath && !isPeerMarked(absPath) ? absPath : null;
  useEffect(() => {
    if (!path) return;
    let live = true;
    HtmlPreviewRoot(path).then(
      (token) => live && setSrc({ path, src: token ? previewSrc(token, basename(path)) : null }),
      () => live && setSrc({ path, src: null }),
    );
    return () => {
      live = false;
    };
  }, [path]);
  if (!path) return null;
  return src?.path === path ? src.src : undefined;
}
