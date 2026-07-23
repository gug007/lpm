import type { CSSProperties } from "react";

// The composer send control's visual definition, shared by the terminal
// composer's split button and the standalone send button so the two stay
// identical: one segmented pill — solid accent when live, a quiet neutral
// shell when there's nothing to send.

export const SEND_SHELL_CLASS = "flex items-center rounded-lg transition-colors duration-150";

export const sendShellTint = (inert: boolean) =>
  inert ? "bg-[var(--composer-inert-bg)]" : "bg-[var(--accent-blue)]";

export const sendGlow = (inert: boolean): CSSProperties | undefined =>
  inert
    ? undefined
    : { boxShadow: "0 2px 12px -2px color-mix(in srgb, var(--accent-blue) 60%, transparent)" };

// `radius` differs by host: the split button's send half only rounds its left
// side, the standalone button rounds the whole pill.
export const sendFaceClass = (inert: boolean, radius: string) =>
  `flex h-7 items-center justify-center ${radius} pl-2.5 pr-2 transition-colors [&>svg]:rotate-45 ${
    inert ? "text-[var(--composer-fg-muted)]" : "text-[var(--bg-primary)] hover:bg-black/10 active:bg-black/20"
  }`;
