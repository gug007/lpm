import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useRef } from "react";
import type { ZoneDisplay, ZoneRows } from "../types";
import { ZONE_GAP_PX, zoneHeight } from "./zoneGeometry";

export type ZoneFrameState = "filled" | "empty" | "target" | "over";

// The footer sits on the terminal's surface, so its frames take the footer's colours.
const FRAME_STATE: Record<ZoneDisplay, Record<ZoneFrameState, string>> = {
  header: {
    filled:
      "border-solid border-[color-mix(in_srgb,var(--text-primary)_14%,transparent)] bg-[color-mix(in_srgb,var(--bg-secondary)_60%,transparent)]",
    empty: "border-dashed border-[color-mix(in_srgb,var(--text-primary)_26%,transparent)]",
    target: "border-dashed border-[var(--accent-blue)]/60",
    over: "border-dashed border-[var(--accent-blue)] bg-[var(--accent-blue)]/[0.06]",
  },
  footer: {
    filled:
      "border-solid border-[color-mix(in_srgb,var(--composer-fg)_14%,transparent)] bg-[color-mix(in_srgb,var(--composer-surface)_60%,transparent)]",
    empty: "border-dashed border-[color-mix(in_srgb,var(--composer-fg)_26%,transparent)]",
    target: "border-dashed border-[var(--accent-blue)]/60",
    over: "border-dashed border-[var(--accent-blue)] bg-[var(--accent-blue)]/[0.06]",
  },
};

interface ZoneFrameProps {
  rows: ZoneRows;
  display?: ZoneDisplay;
  state: ZoneFrameState;
  onContextMenu?: (e: MouseEvent<HTMLDivElement>) => void;
  onWheel?: (e: WheelEvent) => void;
  children: ReactNode;
}

// Exactly `rows` rows of its bar tall; its padding is the zone's one spacing value.
export function ZoneFrame({ rows, display = "header", state, onContextMenu, onWheel, children }: ZoneFrameProps) {
  const style: CSSProperties = { height: zoneHeight(rows, display), padding: ZONE_GAP_PX };
  const ref = useRef<HTMLDivElement>(null);
  // Native and non-passive: React's onWheel is passive, so it couldn't keep a
  // sideways swipe from also scrolling the row.
  useEffect(() => {
    const el = ref.current;
    if (!el || !onWheel) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);
  return (
    <div
      ref={ref}
      data-zone-frame=""
      onContextMenu={onContextMenu}
      style={style}
      className={`relative box-border shrink-0 rounded-[10px] border transition-colors duration-150 ${FRAME_STATE[display][state]}`}
    >
      {children}
    </div>
  );
}
