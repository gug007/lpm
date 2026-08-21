// One line of a hand-built terminal replica: a run of spans, each carrying the
// color the real CLI paints it. Shared so every replica on the site renders the
// same transcript model instead of drifting apart.
export type Span = { t: string; c?: string };

// gap = blank line above, matching the CLIs' block spacing; band = a tinted
// full-width row, bubble = a content-width tinted run inside the line.
export type Line = { spans: Span[]; gap?: boolean; band?: string; bubble?: string };

export const s = (t: string, c?: string): Span => ({ t, c });
export const line = (...spans: Span[]): Line => ({ spans });
export const gap = (...spans: Span[]): Line => ({ spans, gap: true });

type TerminalLineProps = {
  line: Line;
  /** Type scale for the line, as a class — replicas set their own. */
  size: string;
  /** Color for spans that don't name one. */
  fallback: string;
  /** The blank line a `gap` renders as; must equal the pane's line height. */
  gapClass?: string;
};

export function TerminalLine({
  line,
  size,
  fallback,
  gapClass = "mt-5",
}: TerminalLineProps) {
  const spans = line.spans.map((span, i) => (
    <span key={i} className={span.c ?? fallback}>
      {span.t}
    </span>
  ));
  return (
    <div
      className={`whitespace-pre tabular-nums ${size}${line.gap ? ` ${gapClass}` : ""}${
        line.band ? ` ${line.band}` : ""
      }`}
    >
      {line.bubble ? <span className={line.bubble}>{spans}</span> : spans}
    </div>
  );
}
