import { Palette, SunMoon } from "lucide-react";
import type { TerminalThemeMode } from "../../terminalThemeChoice";
import { SegmentButton } from "./SegmentButton";

const MODES = [
  { mode: "single", label: "One theme", Icon: Palette },
  { mode: "follow", label: "Follow app appearance", Icon: SunMoon },
] as const;

export function TerminalThemeModeControl({
  mode,
  onChange,
}: {
  mode: TerminalThemeMode;
  onChange: (mode: TerminalThemeMode) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Terminal theme mode"
      data-settings-row="terminal.themeFollow"
      className="flex rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5"
    >
      {MODES.map(({ mode: value, label, Icon }) => (
        <SegmentButton
          key={value}
          label={label}
          icon={<Icon size={12} strokeWidth={2} />}
          active={mode === value}
          onClick={() => {
            if (value !== mode) onChange(value);
          }}
        />
      ))}
    </div>
  );
}
