import { isImagePath } from "../composerValue";
import { isWindows } from "../platform";

export type MediaKind = "image" | "video" | "audio" | "pdf";
// The kinds an element streams and plays, rather than drawing once.
export type PlayableKind = "video" | "audio";

// Deliberately NOT folded into composerValue's IMAGE_EXT_RE: that regex also
// decides which dropped file becomes an image chip the agent receives as an
// attachment, and a dropped video must stay a plain file chip.
const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|mkv|avi|ogv)$/i;

const VIDEO_MIME: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};

export function isVideoPath(path: string): boolean {
  return VIDEO_EXT_RE.test(path);
}

const AUDIO_EXT_RE = /\.(mp3|m4a|aac|wav|flac|ogg|oga|opus|weba|caf|aif|aiff)$/i;

const AUDIO_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  weba: "audio/webm",
  caf: "audio/x-caf",
  aif: "audio/aiff",
  aiff: "audio/aiff",
};

export function isAudioPath(path: string): boolean {
  return AUDIO_EXT_RE.test(path);
}

const PDF_EXT_RE = /\.pdf$/i;

// SVG is an image the app can render and source it can edit; a viewer that
// offers editing treats it as text, one that only previews rasterises it.
const SOURCE_IMAGE_RE = /\.svg$/i;

export function isSourceImage(path: string): boolean {
  return SOURCE_IMAGE_RE.test(path);
}

export function mediaKind(path: string): MediaKind | null {
  if (isImagePath(path)) return "image";
  if (isVideoPath(path)) return "video";
  if (isAudioPath(path)) return "audio";
  if (PDF_EXT_RE.test(path)) return "pdf";
  return null;
}

export function videoMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_MIME[ext] ?? "";
}

export function audioMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_MIME[ext] ?? "";
}

// The extension tables are wider than what the webview can actually decode —
// .mkv and .avi never play in WebKit, and WebView2 has no .caf or .aiff. Asking
// the element keeps those on an honest "can't preview this format" arm instead
// of a dead player. They are still listed above so they land there rather than
// falling through to the text reader, which would render them as lossy
// mojibake and offer an Edit that corrupts the file on save.
export function canPlay(path: string, kind: PlayableKind): boolean {
  const mime = kind === "video" ? videoMime(path) : audioMime(path);
  if (!mime) return false;
  try {
    return document.createElement(kind).canPlayType(mime) !== "";
  } catch {
    return false;
  }
}

export const MEDIA_SCHEME = "lpm-media";

// Media is served over a custom scheme rather than read through a command: a
// <video> or <audio> seeks by asking for byte ranges, so the bytes have to stay
// random-access on the Rust side instead of crossing the IPC boundary as one
// base64 blob. Path goes over as a single percent-encoded segment, which is
// what the handler decodes. WebView2 only routes a custom scheme as
// http://<scheme>.localhost/ (wry maps it back before the handler runs).
// WebKitGTK's player can't stream from a custom scheme at all, so Linux passes
// the loopback endpoint that serves the same bytes (`httpBase`).
export function mediaSrc(
  absPath: string,
  windows: boolean = isWindows,
  httpBase: string | null = null,
): string {
  const segment = encodeURIComponent(absPath);
  if (httpBase) return `${httpBase}/${segment}`;
  return windows
    ? `http://${MEDIA_SCHEME}.localhost/${segment}`
    : `${MEDIA_SCHEME}://localhost/${segment}`;
}
