import type { TerminalLook } from "./machineCommands";

// A look's background with its text and first six colors on it.
export function TerminalLookSwatches({ look }: { look: TerminalLook }) {
  const c = look.colors;
  if (!c) return null;
  const dots = c.ansi.slice(1, 7).filter(Boolean);
  return (
    <span
      aria-hidden
      className="flex h-5 shrink-0 items-center gap-0.5 rounded-md px-1.5"
      style={{ background: c.background, boxShadow: "inset 0 0 0 1px rgba(127,127,127,0.25)" }}
    >
      <span className="mr-0.5 text-[10px] font-semibold" style={{ color: c.foreground }}>
        Aa
      </span>
      {dots.map((color, i) => (
        <span key={i} className="h-2 w-2 rounded-full" style={{ background: color }} />
      ))}
    </span>
  );
}
