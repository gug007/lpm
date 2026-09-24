import type { TermLine } from "./explorer-terminal-data";

const LIGHT = "h-2.5 w-2.5 rounded-full bg-[#4a4a4a]";

const LINE_STAGGER_MS = 35;

const OUT_TONE = {
  error: "text-[#ff8b80]",
  note: "italic text-[#8a8a8a]",
} as const;

function lineText(line: TermLine) {
  switch (line.kind) {
    case "cmd":
      return `${line.cwd} $ ${line.text}`;
    case "out":
      return line.text;
    case "status":
      return `${line.code} ${line.path}`;
    case "prompt":
      return `${line.cwd} $`;
  }
}

/** Keys that survive a line moving up or down, so only new lines fade in. */
function lineKeys(lines: TermLine[]) {
  const seen = new Map<string, number>();
  return lines.map((line) => {
    const base = `${line.kind}:${lineText(line)}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return `${base}#${n}`;
  });
}

export default function MiniTerminal({
  title,
  lines,
  accent,
}: {
  title: string;
  lines: TermLine[];
  accent: string;
}) {
  const keys = lineKeys(lines);
  return (
    <div
      data-on-dark
      className="flex flex-1 flex-col overflow-hidden rounded-xl bg-[#1a1a1a] ring-1 ring-black/10 shadow-[0_12px_32px_-18px_rgba(0,0,0,0.55)] dark:ring-white/[0.12] dark:shadow-[0_12px_32px_-18px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-center gap-1.5 border-b border-[#2e2e2e] bg-[#212121] px-3 py-2">
        <span aria-hidden className={LIGHT} />
        <span aria-hidden className={LIGHT} />
        <span aria-hidden className={LIGHT} />
        <span className="ml-2 min-w-0 truncate font-mono text-[11px] text-[#8a8a8a]">
          {title}
        </span>
      </div>
      <div className="flex-1 px-3.5 py-3 font-mono text-[11px] leading-[1.65] text-[#c9c9c9] sm:text-xs md:text-[11px] lg:text-xs">
        {lines.map((line, i) => (
          <div
            key={keys[i]}
            style={{ transitionDelay: `${Math.min(i, 14) * LINE_STAGGER_MS}ms` }}
            className="whitespace-pre-wrap [overflow-wrap:anywhere] motion-safe:transition-opacity motion-safe:duration-300 motion-safe:starting:opacity-0"
          >
            {line.kind === "cmd" || line.kind === "prompt" ? (
              <>
                <span className={accent}>{line.cwd}</span>
                <span className="text-[#8a8a8a]"> $ </span>
                {line.kind === "cmd" ? (
                  <span className="text-[#f2f2f2]">{line.text}</span>
                ) : (
                  <span
                    aria-hidden
                    className="inline-block h-[1.1em] w-[0.55em] translate-y-[0.2em] bg-[#c9c9c9] animate-caret-blink"
                  />
                )}
              </>
            ) : line.kind === "status" ? (
              <>
                <span className="text-[#ff8b80]">{line.code}</span> {line.path}
              </>
            ) : (
              <span className={line.tone ? OUT_TONE[line.tone] : undefined}>
                {line.text || " "}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
