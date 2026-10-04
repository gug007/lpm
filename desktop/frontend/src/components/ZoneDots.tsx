import { useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { ZoneLayerView } from "../actionsLayoutModel";
import type { ZoneDisplay } from "../types";
import { layerName } from "../zoneLayers";
import { zoneDotsId } from "./actionsDndLayout";
import type { ZoneFrameState } from "./ZoneFrame";
import { zoneNotchBackground } from "./zoneNotch";

const HOVER_OPEN_MS = 500;

const TONE: Record<ZoneDisplay, { label: string; dot: string }> = {
  header: {
    label: "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
    dot: "bg-[color-mix(in_srgb,var(--text-primary)_26%,transparent)] group-hover/dot:bg-[color-mix(in_srgb,var(--text-primary)_50%,transparent)]",
  },
  footer: {
    label: "text-[var(--composer-fg-muted)] hover:text-[var(--composer-fg)]",
    dot: "bg-[color-mix(in_srgb,var(--composer-fg)_26%,transparent)] group-hover/dot:bg-[color-mix(in_srgb,var(--composer-fg)_50%,transparent)]",
  },
};

// globals.css turns pointer events off inside the action rows mid-drag; the
// dots take them back so a dragged button can hover one open.
const LIVE_DURING_DRAG = { pointerEvents: "auto" } as const;

function dotSize(open: boolean, dragging: boolean): string {
  if (dragging) return open ? "h-2 w-4" : "h-2 w-2";
  return open ? "h-1 w-3" : "h-1 w-1";
}

interface ZoneDotsProps {
  zone: string;
  layers: ZoneLayerView[];
  openKey: string;
  dragging: boolean;
  display: ZoneDisplay;
  frameState: ZoneFrameState;
  onOpen: (key: string) => void;
}

export function ZoneDots({ zone, layers, openKey, dragging, display, frameState, onOpen }: ZoneDotsProps) {
  const { setNodeRef } = useDroppable({ id: zoneDotsId(zone), disabled: !dragging });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clearTimer, []);
  useEffect(() => {
    if (!dragging) clearTimer();
  }, [dragging]);

  if (layers.length < 2) return null;
  const open = Math.max(
    0,
    layers.findIndex((view) => view.key === openKey),
  );
  const names = layers.map((view, index) => layerName(view.layer?.label, index));
  const named = layers.some((view) => view.layer?.label);
  const tone = TONE[display];
  const hoverOpen = (key: string) => {
    clearTimer();
    if (!dragging || key === openKey) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      onOpen(key);
    }, HOVER_OPEN_MS);
  };

  return (
    <div
      ref={setNodeRef}
      data-zone-dots=""
      className={`absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 px-[5px] ${
        dragging ? "bottom-[-7.5px] h-[14px]" : "bottom-[-5.5px] h-[10px]"
      }`}
      style={{ ...LIVE_DURING_DRAG, background: zoneNotchBackground(display, frameState) }}
    >
      {named && (
        <button
          type="button"
          aria-label={`${names[open]}, next layer`}
          onClick={() => onOpen(layers[(open + 1) % layers.length].key)}
          className={`relative grid cursor-pointer text-[10px] leading-none font-medium transition-colors after:absolute after:inset-x-[-3px] after:inset-y-[-5px] ${tone.label}`}
          style={LIVE_DURING_DRAG}
        >
          {names.map((name, index) => (
            <span
              key={layers[index].key}
              className={`[grid-area:1/1] whitespace-nowrap ${index === open ? "visible" : "invisible"}`}
            >
              {name}
            </span>
          ))}
        </button>
      )}
      <div className="flex items-center">
        {layers.map((view, index) => {
          const isOpen = index === open;
          return (
            <button
              key={view.key}
              type="button"
              aria-label={names[index]}
              aria-pressed={isOpen}
              title={names[index]}
              onClick={() => onOpen(view.key)}
              onPointerEnter={() => hoverOpen(view.key)}
              onPointerLeave={clearTimer}
              className={`group/dot grid shrink-0 cursor-pointer place-items-center px-[1.5px] ${dragging ? "py-[3px]" : "py-1.5"}`}
              style={LIVE_DURING_DRAG}
            >
              <span
                className={`block rounded-full transition-[width,height,background-color] duration-300 ease-[cubic-bezier(.22,.8,.24,1)] motion-reduce:transition-none ${dotSize(
                  isOpen,
                  dragging,
                )} ${isOpen ? "bg-[var(--accent-blue)]" : tone.dot}`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
