import { useCallback, useEffect, useState, type SyntheticEvent } from "react";
import { NotesReadFileAsInput } from "../../bridge/commands";
import { useContentZoom, type ContentZoom } from "../hooks/useContentZoom";
import { formatBytes } from "../syncApi";
import {
  base64ByteLength,
  formatImageMeta,
  zoomPercent,
  type Size,
} from "./imageFit";

// A preview read of a peer-hosted image crosses the peer WebSocket as one
// base64 frame, and the reader drops the whole connection to that Mac on an
// oversized frame rather than failing the one call — so the preview asks for a
// bounded read instead of the attachment ceiling.
export const IMAGE_PREVIEW_MAX_BYTES = 8 * 1024 * 1024;

export interface ImagePreview {
  dataUrl: string | null;
  error: string | null;
  meta: string | null;
  natural: Size | null;
  scale: number;
  zoom: ContentZoom;
  setFit: (fit: number) => void;
  onImgLoad: (e: SyntheticEvent<HTMLImageElement>) => void;
  onImgError: () => void;
}

export function useImagePreview(path: string, active: boolean): ImagePreview {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [bytes, setBytes] = useState(0);
  const [natural, setNatural] = useState<Size | null>(null);
  const [undecodable, setUndecodable] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [fit, setFitState] = useState(1);
  const z = useContentZoom(active);

  const { zoomReset } = z;
  useEffect(() => {
    setNatural(null);
    setUndecodable(false);
    setFitState(1);
    zoomReset();
    if (!active || !path) {
      setDataUrl(null);
      setBytes(0);
      setReadError(null);
      return;
    }
    let cancelled = false;
    setDataUrl(null);
    setBytes(0);
    setReadError(null);
    NotesReadFileAsInput(path, IMAGE_PREVIEW_MAX_BYTES)
      .then((input: { mimeType?: string; data: string }) => {
        if (cancelled) return;
        setBytes(base64ByteLength(input.data));
        setDataUrl(`data:${input.mimeType || "image/png"};base64,${input.data}`);
      })
      .catch((err) => {
        if (cancelled) return;
        setReadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path, active, zoomReset]);

  // Damped so a sub-pixel container change can't drive a measure/fit loop.
  const setFit = useCallback(
    (next: number) => setFitState((f) => (Math.abs(f - next) < 0.001 ? f : next)),
    [],
  );

  // An SVG carrying only a viewBox reports 0×0 in WebKit; leaving `natural`
  // null keeps it on the percentage-width path instead of collapsing it.
  const onImgLoad = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    setNatural(w > 0 && h > 0 ? { w, h } : null);
  }, []);

  const onImgError = useCallback(() => setUndecodable(true), []);

  return {
    dataUrl,
    error: readError ?? (undecodable ? "Preview unavailable" : null),
    meta: formatImageMeta(natural, bytes > 0 ? formatBytes(bytes) : ""),
    natural,
    scale: fit * z.zoom,
    zoom: { ...z, percent: zoomPercent(fit, z.zoom) },
    setFit,
    onImgLoad,
    onImgError,
  };
}
