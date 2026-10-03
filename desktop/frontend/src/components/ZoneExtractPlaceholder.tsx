import type { ZoneEndSlot } from "./zoneGeometry";

interface ZoneExtractPlaceholderProps {
  slot: ZoneEndSlot;
}

// In a free cell it fills the cell, so it's exactly as tall as the zone's
// buttons and as wide as their column; an empty zone has no column yet, so it
// takes a width of its own within the zone's minimum. A new column would grow
// the zone under the pointer (the header is right-anchored), so a full zone
// only gets an insertion line at its trailing edge, outside the grid's flow.
export function ZoneExtractPlaceholder({ slot }: ZoneExtractPlaceholderProps) {
  if (slot === "column") {
    return (
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-1 right-px w-0.5 rounded-full bg-[var(--accent-blue)]"
      />
    );
  }
  return (
    <div
      aria-hidden
      className={`rounded-md border-2 border-dashed border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 ${
        slot === "first" ? "w-14" : "min-w-0"
      }`}
    />
  );
}
