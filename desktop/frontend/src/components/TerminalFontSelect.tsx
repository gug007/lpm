import { AnchoredSelect } from "./ui/AnchoredSelect";
import { TERMINAL_FONT_FAMILY, terminalFontStack } from "./terminal-utils";

const SAMPLE = "Il1 0O";

interface TerminalFontSelectProps {
  value?: string;
  options: string[];
  onChange: (family?: string) => void;
}

export function TerminalFontSelect({ value, options, onChange }: TerminalFontSelectProps) {
  const label = (family?: string) => family ?? "Default";
  const stack = (family?: string) =>
    family ? terminalFontStack(family) : TERMINAL_FONT_FAMILY;

  return (
    <AnchoredSelect<string | undefined>
      value={value}
      options={[undefined, ...options]}
      onChange={onChange}
      label={label}
      ariaLabel="Terminal font"
      renderValue={(family) => (
        <span
          className="min-w-0 flex-1 truncate text-left"
          style={{ fontFamily: stack(family) }}
        >
          {label(family)}
        </span>
      )}
      renderOption={(family) => (
        <>
          <span
            className="min-w-0 flex-1 truncate"
            style={{ fontFamily: stack(family) }}
          >
            {label(family)}
          </span>
          <span
            aria-hidden
            className="shrink-0 text-[11px] text-[var(--text-muted)]"
            style={{ fontFamily: stack(family) }}
          >
            {SAMPLE}
          </span>
        </>
      )}
    />
  );
}
