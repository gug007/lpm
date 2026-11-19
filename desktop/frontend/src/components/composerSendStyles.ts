import type { CSSProperties } from "react";

// The composer send control's visual definition, shared by the terminal
// composer's split button, the standalone send button, and the mic that takes
// Send's place in an empty composer, so they stay identical: one segmented
// pill — solid accent when live, a quiet neutral shell when there's nothing
// to send.

export const SEND_SHELL_CLASS = "flex items-center rounded-lg transition-colors duration-150";

export const VIDEO_ACCENT = "var(--accent-violet)";

// A prompt that comes back as a video sends from a violet pill, so the button
// itself says the answer won't be text.
export const sendShellTint = (inert: boolean, video = false) =>
  inert ? "bg-[var(--composer-inert-bg)]" : video ? "bg-[var(--accent-violet)]" : "bg-[var(--accent-blue)]";

export const sendGlow = (inert: boolean, accent = "var(--accent-blue)"): CSSProperties | undefined =>
  inert
    ? undefined
    : { boxShadow: `0 2px 12px -2px color-mix(in srgb, ${accent} 60%, transparent)` };

// `radius` differs by host: the split button's send half only rounds its left
// side, the standalone button rounds the whole pill.
const sendFaceTone = (inert: boolean) =>
  inert ? "text-[var(--composer-fg-muted)]" : "text-[var(--bg-primary)] hover:bg-black/10 active:bg-black/20";

export const sendFaceClass = (inert: boolean, radius: string) =>
  `flex h-7 items-center justify-center ${radius} pl-2.5 pr-2 transition-colors [&>svg]:rotate-45 ${sendFaceTone(inert)}`;

// The send half while the prompt asks for a video: it names what comes back,
// so a video is never a surprise.
export const sendVideoFaceClass = (inert: boolean) =>
  `flex h-7 items-center gap-1.5 rounded-l-lg pl-2.5 pr-2 text-[11.5px] font-medium whitespace-nowrap transition-colors [&>svg]:h-2.5 [&>svg]:w-2.5 ${sendFaceTone(inert)}`;
