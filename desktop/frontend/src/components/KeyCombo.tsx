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

// A raised, pressable-looking cap. Depth comes from a top inner highlight, a
// bottom inner edge, and a soft drop shadow — all rgba so it reads in both
// light and dark themes without hardcoding surface colors.
const KEYCAP_SHADOW =
  "0 1px 1.5px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.10), inset 0 -1px 0 rgba(0,0,0,0.12)";

function Keycap({ label }: { label: string }) {
  return (
    <kbd
      style={{ boxShadow: KEYCAP_SHADOW }}
      className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-[6px] border border-[var(--border)] bg-[var(--bg-active)] px-1.5 text-[11px] font-medium leading-none text-[var(--text-primary)]"
    >
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
            <span className="text-[9px] font-medium text-[var(--text-muted)]">
              +
            </span>
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
