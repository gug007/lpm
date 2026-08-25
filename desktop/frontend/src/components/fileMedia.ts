import { isImagePath } from "../composerValue";

export type MediaKind = "image" | "video";

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

export function mediaKind(path: string): MediaKind | null {
  if (isImagePath(path)) return "image";
  if (isVideoPath(path)) return "video";
  return null;
}

export function videoMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_MIME[ext] ?? "";
}

// The extension table is wider than what WebKit can actually decode — .mkv and
// .avi never play, and an .mp4 can still hold a codec it refuses. Asking the
// element keeps those on an honest "can't preview this format" arm instead of a
// black rectangle. Matroska/AVI are still listed above so they land there
// rather than falling through to the text reader, which would render them as
// lossy mojibake and offer an Edit that corrupts the file on save.
export function canPlayVideo(path: string): boolean {
  const mime = videoMime(path);
  if (!mime) return false;
  try {
    return document.createElement("video").canPlayType(mime) !== "";
  } catch {
    return false;
  }
}

export const MEDIA_SCHEME = "lpm-media";

// Media is served over a custom scheme rather than read through a command: a
// <video> seeks by asking for byte ranges, so the bytes have to stay
// random-access on the Rust side instead of crossing the IPC boundary as one
// base64 blob. Path goes over as a single percent-encoded segment, which is
// what the handler decodes.
export function mediaSrc(absPath: string): string {
  return `${MEDIA_SCHEME}://localhost/${encodeURIComponent(absPath)}`;
}
