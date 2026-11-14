import type { MouseEvent } from "react";
import type { FileViewerMode } from "../store/fileViewer";
import type { Size } from "./imageFit";

export interface FileViewerLayout {
  mode: FileViewerMode;
  dockWidth: number;
  onModeChange: (mode: FileViewerMode) => void;
  onDockResizeStart: (e: MouseEvent) => void;
}

// FileViewerCompactHeader's h-9, which a minimized media window adds on top
// of the picture.
const MINI_HEADER_PX = 36;
const MINI_MEDIA_BOX: Size = { w: 384, h: 360 };
const MINI_MIN_WIDTH = 260;
const MINI_TEXT: Size = { w: 420, h: 320 };
// Audio has no picture to hug: the header over a row of player controls.
export const MINI_AUDIO: Size = { w: 384, h: MINI_HEADER_PX + 56 };

// A minimized window hugs a video or image at its aspect, within a box small
// enough to leave the terminal under it usable; text gets a fixed card.
export function miniSize(media: Size | null, isMedia: boolean): Size {
  if (!isMedia) return MINI_TEXT;
  if (!media) {
    return { w: MINI_MEDIA_BOX.w, h: Math.round((MINI_MEDIA_BOX.w * 9) / 16) + MINI_HEADER_PX };
  }
  const scale = Math.min(1, MINI_MEDIA_BOX.w / media.w, MINI_MEDIA_BOX.h / media.h);
  return {
    w: Math.max(MINI_MIN_WIDTH, Math.round(media.w * scale)),
    h: Math.round(media.h * scale) + MINI_HEADER_PX,
  };
}
