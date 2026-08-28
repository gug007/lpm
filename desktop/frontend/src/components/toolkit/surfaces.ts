import type { CSSProperties } from "react";

// The Toolkit pane draws no lines: grouping comes from tonal panels and space,
// and colour is spent only on the things that are not loading. Defined once as
// custom properties on the pane root so every surface mixes from the same
// recipe and follows the theme without a second palette.
export const SURFACE_TOKENS = {
  "--tk-radius": "14px",
  "--tk-radius-s": "9px",
  "--tk-panel": "color-mix(in srgb, var(--text-primary) 4%, var(--bg-primary))",
  "--tk-hover": "color-mix(in srgb, var(--text-primary) 6%, transparent)",
  "--tk-active": "color-mix(in srgb, var(--text-primary) 9%, transparent)",
  "--tk-fault": "color-mix(in srgb, var(--accent-amber) 12%, var(--bg-primary))",
  "--tk-fault-hover": "color-mix(in srgb, var(--accent-amber) 10%, transparent)",
  "--tk-fault-active": "color-mix(in srgb, var(--accent-amber) 16%, transparent)",
  // The one shadow in the pane, and it does work: it lifts the faults clear of
  // the inventory without a border or a red edge.
  "--tk-lift":
    "0 1px 2px color-mix(in srgb, var(--text-primary) 8%, transparent), 0 10px 22px -10px color-mix(in srgb, var(--text-primary) 24%, transparent)",
} as CSSProperties;

export const PANEL = "rounded-[var(--tk-radius)] bg-[var(--tk-panel)] p-2";

export const FAULT_PANEL =
  "rounded-[var(--tk-radius)] bg-[var(--tk-fault)] p-2 shadow-[var(--tk-lift)]";

export const PANEL_LABEL =
  "flex w-full items-baseline justify-between gap-3 px-2 pb-1 text-left text-[10.5px] leading-[13px] text-[var(--text-muted)]";

export const FAULT_LABEL =
  "text-[10px] uppercase tracking-[0.09em] text-[var(--accent-amber-text)]";

export const ROW =
  "grid w-full grid-cols-[minmax(0,auto)_minmax(0,1fr)_auto] items-baseline gap-2.5 rounded-[var(--tk-radius-s)] px-2 py-[3px] text-left transition-colors";

export const CHOICE =
  "flex w-full items-center gap-2 rounded-[var(--tk-radius-s)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--tk-hover)]";

export const FIELD =
  "h-[26px] min-w-0 rounded-[var(--tk-radius-s)] bg-[var(--tk-panel)] px-2.5 text-[11.5px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:outline-[1.5px] focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--accent-blue)]";

export const TEXTAREA =
  "w-full resize-none rounded-[var(--tk-radius-s)] bg-[var(--tk-panel)] p-3 text-[13px] leading-[19px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus-visible:outline-[1.5px] focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--accent-blue)]";

export const QUIET_BUTTON =
  "shrink-0 rounded-[var(--tk-radius-s)] px-1.5 py-1 text-[10.5px] text-[var(--text-muted)] opacity-60 transition-opacity hover:opacity-100 disabled:opacity-40";
