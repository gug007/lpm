import { AnchoredSelect } from "./ui/AnchoredSelect";
import {
  getTerminalThemeColors,
  terminalThemeNames,
  type TerminalThemeName,
} from "../terminal-themes";

interface TerminalThemeSelectProps {
  value: TerminalThemeName;
  onChange: (theme: TerminalThemeName) => void;
  onHighlightChange?: (theme: TerminalThemeName | null) => void;
}

function Swatch({ theme }: { theme: TerminalThemeName }) {
  const colors = getTerminalThemeColors(theme);
  return (
    <span
      aria-hidden
      className="flex h-4 w-6 shrink-0 items-center justify-center rounded border border-[var(--border)] text-[9px] leading-none"
      style={{
        background: colors?.bg ?? "var(--terminal-bg)",
        color: colors?.fg ?? "var(--terminal-fg)",
      }}
    >
      Aa
    </span>
  );
}

export function TerminalThemeSelect({
  value,
  onChange,
  onHighlightChange,
}: TerminalThemeSelectProps) {
  const label = (theme: TerminalThemeName) =>
    theme === "default" ? "Default" : theme;

  return (
    <AnchoredSelect<TerminalThemeName>
      value={value}
      options={[...terminalThemeNames]}
      onChange={onChange}
      onHighlightChange={onHighlightChange}
      label={label}
      ariaLabel="Terminal theme"
      renderValue={(theme) => (
        <>
          <Swatch theme={theme} />
          <span className="min-w-0 flex-1 truncate text-left">{label(theme)}</span>
        </>
      )}
      renderOption={(theme) => (
        <>
          <Swatch theme={theme} />
          <span className="min-w-0 flex-1 truncate">{label(theme)}</span>
        </>
      )}
    />
  );
}
