import { type ZoneInfo, zoneDisplayOf } from "../../types";
import { zoneOfListKey, zonePlacements } from "../../zoneLayers";
import { PanelBottomIcon, PanelTopIcon } from "../icons";
import { ModeButton } from "./ModeButton";

interface DisplayPickerProps {
  // "header", "footer", a zone, or zone/layer for a zone with layers.
  display: string;
  zones: ZoneInfo[];
  onChange: (value: string) => void;
}

export function DisplayPicker({ display, zones, onChange }: DisplayPickerProps) {
  const zoneName = zoneOfListKey(display);
  const zone = zones.find((entry) => entry.name === zoneName);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">Placement</span>
        <span className="text-[12px] text-[var(--text-muted)]">
          {display === "footer"
            ? "Pinned to the terminal footer bar."
            : zone
              ? `In the ${zone.label} zone of the ${zoneDisplayOf(zone)} row.`
              : "In the header row above the terminal."}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--bg-secondary)] p-1">
        <ModeButton
          active={display === "header"}
          icon={<PanelTopIcon />}
          title="Header"
          onClick={() => onChange("header")}
        />
        <ModeButton
          active={display === "footer"}
          icon={<PanelBottomIcon />}
          title="Footer"
          onClick={() => onChange("footer")}
        />
      </div>
      {zones.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {zonePlacements(zones).map(({ listKey, label }) => (
            <button
              key={listKey}
              type="button"
              aria-pressed={display === listKey}
              onClick={() => onChange(listKey)}
              className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                display === listKey
                  ? "border-[var(--text-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
