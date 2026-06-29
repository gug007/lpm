import { Fragment } from "react";
import type { TipSegment } from "./appTips";

const MODIFIERS = new Set(["⌘", "⇧", "⌥", "⌃"]);

// Split a combo label into its individual keys so each renders as its own cap:
// modifier glyphs each stand alone, the remaining run is one key ("Esc", "↵", "R").
function splitKeys(label: string): string[] {
  const keys: string[] = [];
  let buf = "";
  for (const ch of label) {
    if (MODIFIERS.has(ch)) {
      if (buf) {
        keys.push(buf);
        buf = "";
      }
      keys.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf) keys.push(buf);
  return keys;
}

function Keycap({ label }: { label: string }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-[var(--bg-active)] px-1.5 text-[11px] font-medium leading-none text-[var(--text-secondary)]">
      {label}
    </kbd>
  );
}

export function Combo({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {splitKeys(label).map((key, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="text-[9px] text-[var(--text-muted)]">+</span>
          )}
          <Keycap label={key} />
        </Fragment>
      ))}
    </span>
  );
}

export function renderSegments(segments: TipSegment[]) {
  return segments.map((seg, i) =>
    typeof seg === "string" ? (
      <span key={i}>{seg}</span>
    ) : (
      <Combo key={i} label={seg.kbd} />
    ),
  );
}
