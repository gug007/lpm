import { shortPath } from "../../toolkit";
import type { SkillDestination } from "../../toolkitSkill";
import { CHOICE } from "./surfaces";

interface ToolkitDestinationsProps {
  destinations: SkillDestination[];
  value: string;
  onChange: (path: string) => void;
}

// Radios rather than a select: there are at most four folders, and which ones
// were not chosen is the part worth seeing — the choice decides which agents
// ever load the skill, and which copy wins if one of them already has the name.
export function ToolkitDestinations({
  destinations,
  value,
  onChange,
}: ToolkitDestinationsProps) {
  return (
    <div role="radiogroup" aria-label="Where it goes" className="flex flex-col">
      {destinations.map((dest) => {
        const chosen = dest.path === value;
        return (
          <button
            key={dest.path}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onChange(dest.path)}
            className={`${CHOICE} ${chosen ? "bg-[var(--tk-active)]" : ""}`}
          >
            <span
              className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-full border ${
                chosen ? "border-[var(--accent-blue)]" : "border-[var(--text-muted)]"
              }`}
            >
              {chosen && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />}
            </span>
            <span className="min-w-0 truncate text-[11.5px] text-[var(--text-primary)]">
              {dest.label}
              {!dest.exists && (
                <span className="text-[var(--text-muted)]"> (will be created)</span>
              )}
            </span>
            <span
              className="ml-auto min-w-0 shrink truncate font-mono text-[10px] text-[var(--text-muted)]"
              title={dest.path}
            >
              {shortPath(dest.path)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
