import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";
import { isPeerMarked, peerSlugOf } from "../peer/markers";
import { peerAlias, usePeerState, type PeerClient } from "../peer/usePeerState";
import { canPlay, mediaSrc, type PlayableKind } from "./fileMedia";
import { useMediaHttpBase } from "./useMediaHttpBase";

export interface MediaPreview {
  src: string | null;
  error: string | null;
  meta: string | null;
  // A video's frame size; audio has none.
  size: { w: number; h: number } | null;
  onLoadedMetadata: (e: SyntheticEvent<HTMLMediaElement>) => void;
  onError: (e: SyntheticEvent<HTMLMediaElement>) => void;
}

const COPY: Record<
  PlayableKind,
  {
    unsupported: string;
    failed: string;
    onHost: string;
    unreachable: (name: string) => string;
    outdated: (name: string) => string;
  }
> = {
  video: {
    unsupported: "This video format can't be previewed.",
    failed: "Could not play this video.",
    onHost: "A video on an SSH server can't be played here.",
    unreachable: (name) => `Can't reach ${name} to play this video.`,
    outdated: (name) => `Update lpm on ${name} to preview its videos here.`,
  },
  audio: {
    unsupported: "This audio format can't be played here.",
    failed: "Could not play this audio file.",
    onHost: "Audio on an SSH server can't be played here.",
    unreachable: (name) => `Can't reach ${name} to play this audio file.`,
    outdated: (name) => `Update lpm on ${name} to play its audio here.`,
  },
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

// Media on a paired Mac streams from there when its lpm serves byte ranges
// (audio came later than video). Otherwise this says why, since the element
// would only report a failed load.
export function peerMediaBlock(path: string, kind: PlayableKind, peers: PeerClient[]): string | null {
  const slug = peerSlugOf(path);
  if (!slug) return null;
  const peer = peers.find((p) => p.slug === slug);
  const name = peerAlias(peers, slug);
  if (!peer?.connected) return COPY[kind].unreachable(name);
  const streams = kind === "video" ? peer.supportsMediaRange : peer.supportsMediaAudio;
  if (!streams) return COPY[kind].outdated(name);
  return null;
}

// The bytes never reach JS: the element streams them from the media scheme a
// range at a time, and this only tracks what it reports back. The modal stays
// mounted between files, so every field resets on a path change. `kind` is
// null when the file is neither video nor audio. A file on an SSH host has
// nothing to stream it from there.
export function useMediaPreview(path: string, kind: PlayableKind | null, onHost = false): MediaPreview {
  const active = kind !== null;
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [duration, setDuration] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  useEffect(() => {
    setDims(null);
    setDuration(0);
    setPlaybackError(null);
  }, [path, kind]);

  const onLoadedMetadata = useCallback((e: SyntheticEvent<HTMLMediaElement>) => {
    const el = e.currentTarget;
    setDims(
      el instanceof HTMLVideoElement && el.videoWidth > 0 && el.videoHeight > 0
        ? { w: el.videoWidth, h: el.videoHeight }
        : null,
    );
    setDuration(el.duration);
  }, []);

  // A source WebKit can't decode fires `error` and renders nothing — it never
  // rejects — so the message has to come off the element's own error code.
  const onError = useCallback(
    (e: SyntheticEvent<HTMLMediaElement>) => {
      if (!kind) return;
      const code = e.currentTarget.error?.code;
      setPlaybackError(
        code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED ? COPY[kind].unsupported : COPY[kind].failed,
      );
    },
    [kind],
  );

  const { state: peerState, loaded: peersLoaded } = usePeerState();
  const onPeer = isPeerMarked(path);
  const blocked = useMemo(() => {
    if (!kind || !path) return null;
    if (onHost) return COPY[kind].onHost;
    const unreachable = onPeer && peersLoaded ? peerMediaBlock(path, kind, peerState.peers) : null;
    return unreachable ?? (canPlay(path, kind) ? null : COPY[kind].unsupported);
  }, [path, kind, onHost, onPeer, peersLoaded, peerState.peers]);
  const media = useMediaHttpBase(active);
  // Until the peer list arrives there is no telling whether that Mac streams.
  const waiting = (onPeer && !peersLoaded) || !media.ready;

  const error = blocked ?? (active ? playbackError : null);
  const parts = [dims ? `${dims.w} × ${dims.h}` : "", formatDuration(duration)].filter(Boolean);

  return {
    src: active && path && !error && !waiting ? mediaSrc(path, undefined, media.base) : null,
    error,
    meta: parts.length > 0 ? parts.join(" · ") : null,
    size: dims,
    onLoadedMetadata,
    onError,
  };
}
