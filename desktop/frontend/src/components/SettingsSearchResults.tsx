import { ChevronRight } from "lucide-react";
import {
  captionFor,
  type SettingsSearchEntry,
} from "../settings-registry";

interface SettingsSearchResultsProps {
  results: SettingsSearchEntry[];
  selectedIndex: number;
  onActivate: (entry: SettingsSearchEntry) => void;
  onHover: (index: number) => void;
}

export function SettingsSearchResults({
  results,
  selectedIndex,
  onActivate,
  onHover,
}: SettingsSearchResultsProps) {
  if (results.length === 0) {
    return (
      <p className="px-2 py-3 text-xs text-[var(--text-muted)]">No matches</p>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      {results.map((entry, index) => {
        const active = index === selectedIndex;
        return (
          <button
            key={entry.id}
            onClick={() => onActivate(entry)}
            onMouseMove={() => onHover(index)}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
              active
                ? "bg-[var(--bg-active)]"
                : "hover:bg-[var(--bg-hover)]"
            }`}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-[var(--text-primary)]">
                {entry.label}
              </span>
              <span className="block truncate text-[10px] text-[var(--text-muted)]">
                {captionFor(entry)}
              </span>
            </span>
            {entry.kind === "view" && (
              <ChevronRight size={14} className="shrink-0 text-[var(--text-muted)]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
