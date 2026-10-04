import type { ZoneDisplay } from "../types";
import type { ZoneFrameState } from "./ZoneFrame";

const BAR: Record<ZoneDisplay, string> = {
  header: "var(--bg-primary)",
  footer: "var(--terminal-bg)",
};

const SURFACE: Record<ZoneDisplay, string> = {
  header: "var(--bg-secondary)",
  footer: "var(--composer-surface)",
};

// ZoneFrame's fill for each state, made opaque over its bar.
function frameFill(display: ZoneDisplay, state: ZoneFrameState): string {
  const bar = BAR[display];
  if (state === "filled") return `color-mix(in srgb, ${SURFACE[display]} 60%, ${bar})`;
  if (state === "over") return `color-mix(in srgb, var(--accent-blue) 6%, ${bar})`;
  return bar;
}

// The frame's fill above the border line and the bar's below it, so a notch
// centred on the line cuts it without showing as a patch of its own.
export function zoneNotchBackground(display: ZoneDisplay, state: ZoneFrameState): string {
  return `linear-gradient(${frameFill(display, state)} 50%, ${BAR[display]} 50%)`;
}
