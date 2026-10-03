import { useEffect, useRef } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { ZoneLayerView } from "../actionsLayoutModel";
import type { ZoneDisplay } from "../types";
import { zoneDotsId } from "./actionsDndLayout";

const HOVER_OPEN_MS = 500;

// The pill takes its bar's background so it cuts the frame's bottom border.
const TONE: Record<ZoneDisplay, { pill: string; label: string; dot: string }> = {
  header: {
    pill: "bg-[var(--bg-primary)]",
    label: "text-[var(--text-secondary)]",
    dot: "bg-[color-mix(in_srgb,var(--text-primary)_30%,transparent)]",
  },
  footer: {
    pill: "bg-[var(--terminal-bg)]",
    label: "text-[var(--composer-fg-secondary)]",
    dot: "bg-[color-mix(in_srgb,var(--composer-fg)_30%,transparent)]",
  },
};

// globals.css turns pointer events off inside the action rows mid-drag; the
// dots take them back so a dragged button can hover one open.
const LIVE_DURING_DRAG = { pointerEvents: "auto" } as const;

interface ZoneDotsProps {
  zone: string;
  layers: ZoneLayerView[];
  openKey: string;
  dragging: boolean;
  display: ZoneDisplay;
  onOpen: (key: string) => void;
}

const layerName = (view: ZoneLayerView, index: number) => view.layer?.label || `Layer ${index + 1}`;

export function ZoneDots({ zone, layers, openKey, dragging, display, onOpen }: ZoneDotsProps) {
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
  const labelled = layers.filter((view) => view.layer?.label);
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
      className={`absolute bottom-[-8px] left-1/2 flex h-[15px] -translate-x-1/2 items-center gap-0.5 rounded-full px-1 ${tone.pill}`}
      style={LIVE_DURING_DRAG}
    >
      {layers[open].layer?.label && (
        <button
          type="button"
          onClick={() => onOpen(layers[(open + 1) % layers.length].key)}
          className={`mr-0.5 ml-px grid cursor-pointer text-[10px] leading-none font-semibold ${tone.label}`}
          style={LIVE_DURING_DRAG}
        >
          {labelled.map((view) => (
            <span
              key={view.key}
              className={`[grid-area:1/1] whitespace-nowrap ${view.key === layers[open].key ? "visible" : "invisible"}`}
            >
              {view.layer?.label}
            </span>
          ))}
        </button>
      )}
      {layers.map((view, index) => {
        const name = layerName(view, index);
        const isOpen = index === open;
        return (
          <button
            key={view.key}
            type="button"
            aria-label={name}
            aria-pressed={isOpen}
            title={name}
            onClick={() => onOpen(view.key)}
            onPointerEnter={() => hoverOpen(view.key)}
            onPointerLeave={clearTimer}
            className={`grid shrink-0 cursor-pointer place-items-center ${dragging ? "h-4 w-4" : "h-3 w-3"}`}
            style={LIVE_DURING_DRAG}
          >
            <span
              className={`rounded-full transition-[width,height,background-color] duration-200 motion-reduce:transition-none ${
                dragging ? "h-2.5 w-2.5" : "h-1.5 w-1.5"
              } ${isOpen ? "bg-[var(--accent-blue)]" : tone.dot}`}
            />
          </button>
        );
      })}
    </div>
  );
}
