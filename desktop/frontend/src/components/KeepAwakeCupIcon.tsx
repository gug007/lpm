const CUP = "M4 9h12v6.5A4.5 4.5 0 0 1 11.5 20h-3A4.5 4.5 0 0 1 4 15.5z";
const HANDLE = "M16 11h1.5a2.5 2.5 0 0 1 0 5H16";
const WISPS = ["M8 2.5c-.9.9.9 1.9 0 3.4", "M12 2.5c-.9.9.9 1.9 0 3.4"];

// The coffee inside the cup's walls, its surface at `level` (0 empty, 1 full):
// a flat top over the rounded bottom, then only the part of the bottom below
// the surface once it falls past where the corners start to curve.
function coffee(level: number): string {
  const y = 18 - Math.max(0.15, Math.min(1, level)) * 7;
  if (y <= 15.5) return `M6 ${y}H14V15.5A2.5 2.5 0 0 1 11.5 18H8.5A2.5 2.5 0 0 1 6 15.5Z`;
  const dx = Math.sqrt(6.25 - (y - 15.5) ** 2);
  return `M${8.5 - dx} ${y}H${11.5 + dx}A2.5 2.5 0 0 1 11.5 18H8.5A2.5 2.5 0 0 1 ${8.5 - dx} ${y}Z`;
}

// The footer's Keep awake cup: empty while it waits or can't hold, and while it
// holds, coffee that drains with the time left under steam that rises. Each
// wisp is its own layer so the steam moves on the compositor rather than
// repainting the cup for as long as Keep awake runs.
export function KeepAwakeCupIcon({ level, ending = false }: { level: number | null; ending?: boolean }) {
  const svg = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  return (
    <span className="relative flex">
      <svg {...svg}>
        {level !== null && (
          <path
            d={coffee(level)}
            stroke="none"
            className={
              ending
                ? "fill-[var(--accent-amber)]"
                : "fill-[color-mix(in_srgb,var(--accent-amber)_55%,var(--text-muted))]"
            }
          />
        )}
        <path d={CUP} />
        <path d={HANDLE} />
      </svg>
      {level !== null &&
        WISPS.map((d, i) => (
          <svg key={d} {...svg} className={`keep-awake-wisp absolute inset-0 ${i === 1 ? "keep-awake-wisp-late" : ""}`}>
            <path d={d} />
          </svg>
        ))}
    </span>
  );
}
