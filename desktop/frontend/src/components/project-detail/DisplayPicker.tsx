import { type ZoneInfo, zoneDisplayOf } from "../../types";
import { PanelBottomIcon, PanelTopIcon } from "../icons";
import { ModeButton } from "./ModeButton";

interface DisplayPickerProps {
  display: string;
  zones: ZoneInfo[];
  onChange: (value: string) => void;
}

export function DisplayPicker({ display, zones, onChange }: DisplayPickerProps) {
  const zone = zones.find((entry) => entry.name === display);
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
          {zones.map((entry) => (
            <button
              key={entry.name}
              type="button"
              aria-pressed={display === entry.name}
              onClick={() => onChange(entry.name)}
              className={`rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ${
                display === entry.name
                  ? "border-[var(--text-primary)] bg-[var(--bg-primary)] text-[var(--text-primary)]"
                  : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
