import { terminalThemeNames, type TerminalAppearance, type TerminalThemeName } from "../../terminal-themes";
import type { TerminalThemeChoice } from "../../terminalThemeChoice";
import { TerminalThemeCard } from "./TerminalThemeCard";

function picksOf(choice: TerminalThemeChoice, name: TerminalThemeName): TerminalAppearance[] {
  if (choice.mode === "single") return [];
  return (["dark", "light"] as const).filter((slot) => choice[slot] === name);
}

export function TerminalThemeGrid({
  choice,
  onPick,
  onPreview,
}: {
  choice: TerminalThemeChoice;
  onPick: (name: TerminalThemeName) => void;
  onPreview: (name: TerminalThemeName | null) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Terminal themes"
      className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(124px,1fr))] gap-x-2.5 gap-y-3"
      onMouseLeave={() => onPreview(null)}
    >
      {terminalThemeNames.map((name) => {
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
  );
}
