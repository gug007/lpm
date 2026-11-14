import { Moon, Sun } from "lucide-react";
import {
  getTerminalThemeColors,
  terminalAnsiColors,
  terminalThemeLabel,
  type TerminalAppearance,
  type TerminalThemeName,
} from "../../terminal-themes";

const BADGES: Record<TerminalAppearance, { label: string; Icon: typeof Moon }> = {
  dark: { label: "Dark", Icon: Moon },
  light: { label: "Light", Icon: Sun },
};

// A theme as a tiny terminal in its own colors; Default has none, so it is
// drawn in the app's.
export function TerminalThemeCard({
  name,
  selected,
  badges,
  onPick,
  onPreview,
}: {
  name: TerminalThemeName;
  selected: boolean;
  badges: TerminalAppearance[];
  onPick: () => void;
  onPreview: (name: TerminalThemeName | null) => void;
}) {
  const colors = getTerminalThemeColors(name);
  const ansi = terminalAnsiColors(colors);
  const bg = colors?.bg ?? "var(--terminal-bg)";
  const fg = colors?.fg ?? "var(--terminal-fg)";
  const header = colors?.header ?? "var(--terminal-header)";
  const headerText = colors?.headerText ?? "var(--terminal-header-text)";
  const cursor = colors?.cursor ?? "var(--terminal-cursor)";
  const label = terminalThemeLabel(name);
  const picks = badges.map((b) => `${BADGES[b].label.toLowerCase()} mode`).join(" and ");

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={picks ? `${label}, used in ${picks}` : label}
      onClick={onPick}
      onMouseEnter={() => onPreview(name)}
      onFocus={() => onPreview(name)}
      onBlur={() => onPreview(null)}
      className="group flex min-w-0 flex-col gap-1.5 rounded-lg text-left outline-none"
    >
      <div
        aria-hidden
        className={`relative w-full overflow-hidden rounded-md border font-mono transition-shadow ${
          selected
            ? "border-transparent ring-2 ring-[var(--accent-blue)]"
            : "border-[var(--border)] group-hover:ring-1 group-hover:ring-[var(--text-muted)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent-blue)]"
        }`}
        style={{ background: bg, color: fg }}
      >
        <div className="flex h-4 items-center gap-[3px] px-1.5" style={{ background: header }}>
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[5px] w-[5px] rounded-full opacity-60" style={{ background: headerText }} />
          ))}
        </div>
        <div className="space-y-px whitespace-pre px-2 pt-1.5 pb-2 text-[10px] leading-[14px] [&>div]:overflow-hidden [&>div]:text-ellipsis">
          <div>
            <span style={{ color: ansi.blue }}>❯</span> npm run dev
          </div>
          <div style={{ color: ansi.green }}>✓ Ready in 842ms</div>
          <div style={{ color: ansi.yellow }}>! 1 warning</div>
          <div className="flex items-center">
            <span>$&nbsp;</span>
            <span className="inline-block h-[11px] w-[6px]" style={{ background: cursor }} />
          </div>
        </div>
        {badges.length > 0 && (
          <div className="absolute top-[3px] right-1 flex gap-0.5">
            {badges.map((b) => {
              const { label: text, Icon } = BADGES[b];
              return (
                <span
                  key={b}
                  className="flex items-center gap-0.5 rounded-full bg-[var(--accent-blue)] px-1.5 py-px font-sans text-[9px] leading-[11px] font-semibold text-white"
                >
                  <Icon size={8} strokeWidth={2.5} />
                  {text}
                </span>
              );
            })}
          </div>
        )}
      </div>
      <span
        className={`truncate px-0.5 text-[11px] ${
          selected ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
