import {
  terminalThemeAppearance,
  terminalThemeNames,
  type TerminalAppearance,
  type TerminalThemeName,
} from "../../terminal-themes";
import type { TerminalThemeChoice } from "../../terminalThemeChoice";
import { TerminalThemeCard } from "./TerminalThemeCard";

function picksOf(choice: TerminalThemeChoice, name: TerminalThemeName): TerminalAppearance[] {
  if (choice.mode === "single") return [];
  return (["dark", "light"] as const).filter((slot) => choice[slot] === name);
}

const GROUPS: { appearance: TerminalAppearance; label: string }[] = [
  { appearance: "dark", label: "Dark" },
  { appearance: "light", label: "Light" },
];

// The themes in a dark group and a light one. Default has no colors of its own
// and is drawn in the app's, so it sits with the app's appearance.
export function TerminalThemeGrid({
  choice,
  onPick,
  onPreview,
  appearance,
}: {
  choice: TerminalThemeChoice;
  onPick: (name: TerminalThemeName) => void;
  onPreview: (name: TerminalThemeName | null) => void;
  /// What the app shows now, which is what Default looks like.
  appearance: TerminalAppearance;
}) {
  const groupOf = (name: TerminalThemeName) => terminalThemeAppearance(name) ?? appearance;
  return (
    <div role="group" aria-label="Terminal themes" className="mt-3 space-y-4" onMouseLeave={() => onPreview(null)}>
      {GROUPS.map((group) => (
        <div key={group.appearance}>
          <p className="mb-2 text-[12px] text-[var(--text-muted)]">{group.label}</p>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-x-2.5 gap-y-3">
            {terminalThemeNames
              .filter((name) => groupOf(name) === group.appearance)
              .map((name) => {
                const picks = picksOf(choice, name);
                return (
                  <TerminalThemeCard
                    key={name}
                    name={name}
                    selected={choice.mode === "single" ? choice.theme === name : picks.length > 0}
                    badges={picks}
                    onPick={() => onPick(name)}
                    onPreview={onPreview}
                  />
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
