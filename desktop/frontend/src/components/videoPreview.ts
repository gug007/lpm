import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { isPeerMarked } from "../peer/markers";
import { canPlayVideo, mediaSrc } from "./fileMedia";

export interface VideoPreview {
  src: string | null;
  error: string | null;
  meta: string | null;
  onLoadedMetadata: (e: SyntheticEvent<HTMLVideoElement>) => void;
  onError: (e: SyntheticEvent<HTMLVideoElement>) => void;
}

const UNSUPPORTED = "This video format can't be previewed.";

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

// The bytes never reach JS: the element streams them from the media scheme a
// range at a time, and this only tracks what it reports back. The modal stays
// mounted between files, so every field resets on a path change.
export function useVideoPreview(path: string, active: boolean): VideoPreview {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    setDims(null);
    setDuration(0);
    setPlaybackError(null);
  }, [path, active]);

  const onLoadedMetadata = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    setDims(
      el.videoWidth > 0 && el.videoHeight > 0
        ? { w: el.videoWidth, h: el.videoHeight }
        : null,
    );
    setDuration(el.duration);
  }, []);

  // A source WebKit can't decode fires `error` and renders nothing — it never
  // rejects — so the message has to come off the element's own error code.
  const onError = useCallback((e: SyntheticEvent<HTMLVideoElement>) => {
    const code = e.currentTarget.error?.code;
    setPlaybackError(
      code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
        ? UNSUPPORTED
        : "Could not play this video.",
    );
  }, []);

  // The media scheme reads local disk, so a file that lives on a paired Mac has
  // no bytes to serve here.
  const blocked = useMemo(() => {
    if (!active || !path) return null;
    if (isPeerMarked(path)) {
      return "Video preview isn't available for a file on another Mac.";
    }
    return canPlayVideo(path) ? null : UNSUPPORTED;
  }, [path, active]);

  const error = blocked ?? (active ? playbackError : null);
  const parts = [
    dims ? `${dims.w} × ${dims.h}` : "",
    formatDuration(duration),
  ].filter(Boolean);

  return {
    src: active && path && !error ? mediaSrc(path) : null,
    error,
    meta: parts.length > 0 ? parts.join(" · ") : null,
    onLoadedMetadata,
    onError,
  };
}
