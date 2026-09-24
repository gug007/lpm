import { BRAND } from "@/components/demo/agent-script";

// Claude Code's launch mascot. The CLI prints it as three rows of block glyphs
// ( ▐▛███▜▌ / ▝▜█████▛▘ /   ▘▘ ▝▝ ), which a web font draws with seams between
// cells, so it is drawn here as the grid those glyphs describe: 9 cells by 3
// rows, each cell split into 2 × 2 quadrants. Runs are [row, first, last].
const RUNS: [number, number, number][] = [
  [0, 3, 14],
  [1, 3, 4],
  [1, 6, 11],
  [1, 13, 14],
  [2, 1, 16],
  [3, 3, 14],
  [4, 4, 4],
  [4, 6, 6],
  [4, 11, 11],
  [4, 13, 13],
];

// The banner keeps a terminal's own row height, tighter than the transcript's,
// so the mascot has a terminal cell's proportions and each of its rows lines
// up with a line of text.
export function ClaudeBanner({ cwd }: { cwd: string }) {
  const b = BRAND.claude;
  return (
    <div className="flex gap-[2ch] text-[0.95em] leading-[1.2]">
      <svg
        viewBox="0 0 18 6"
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        aria-hidden="true"
        className={`h-[3.6em] w-[9ch] shrink-0 ${b.color}`}
      >
        {RUNS.map(([row, first, last]) => (
          <rect key={`${row}-${first}`} x={first} y={row} width={last - first + 1} height={1} fill="currentColor" />
        ))}
      </svg>
      <div className="whitespace-pre">
        <div>
          <span className="font-semibold text-[#f2f2f2]">{b.name}</span>{" "}
          <span className="text-[#999999]">{b.version}</span>
        </div>
        <div className="text-[#999999]">
          {b.model} · {b.account}
        </div>
        <div className="text-[#999999]">{cwd}</div>
      </div>
    </div>
  );
}
