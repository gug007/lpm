import type { CSSProperties } from "react";

interface ScheduleLegendProps {
  projects: string[];
  accentFor: (project: string) => string;
}

const NEUTRAL = "var(--text-muted)";

const HATCH =
  "repeating-linear-gradient(135deg, color-mix(in srgb, var(--text-muted) 16%, transparent) 0 3px, transparent 3px 6px)";

// Built from the same fill/border recipe ScheduleBlock draws a slot with, so a
// shape on the board can be matched to a word here without translating. The
// board's hue comes from the project, so the keys stand in the neutral one and
// leave colour to the swatches on the left.
function keyStyle(options: {
  accent?: string;
  fill?: number;
  border: "solid" | "dashed" | "dotted";
  edge: "solid" | "dashed";
  hatch?: boolean;
  faded?: boolean;
}): CSSProperties {
  const accent = options.accent ?? NEUTRAL;
  return {
    backgroundColor: options.fill
      ? `color-mix(in srgb, ${accent} ${options.fill}%, var(--bg-primary))`
      : "transparent",
    backgroundImage: options.hatch ? HATCH : undefined,
    borderWidth: "1px",
    borderStyle: options.border,
    borderColor: `color-mix(in srgb, ${accent} 40%, var(--bg-primary))`,
    borderLeftWidth: "3px",
    borderLeftStyle: options.edge,
    borderLeftColor: accent,
    opacity: options.faded ? 0.75 : undefined,
  };
}

const STATE_KEYS: { label: string; style: CSSProperties }[] = [
  { label: "ran", style: keyStyle({ fill: 16, border: "solid", edge: "solid" }) },
  {
    label: "running",
    style: keyStyle({ accent: "var(--accent-cyan)", fill: 16, border: "solid", edge: "solid" }),
  },
  { label: "upcoming", style: keyStyle({ fill: 8, border: "dashed", edge: "solid" }) },
  { label: "~ expected", style: keyStyle({ fill: 8, border: "dashed", edge: "dashed" }) },
  { label: "missed", style: keyStyle({ border: "dotted", edge: "solid", faded: true }) },
  { label: "paused", style: keyStyle({ border: "dashed", edge: "dashed", hatch: true }) },
];

const KEY_ITEM = "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap";
const KEY_SHAPE = "h-[13px] w-[22px] shrink-0 rounded-[3px]";

export function ScheduleLegend({ projects, accentFor }: ScheduleLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1 text-[10px] text-[var(--text-muted)]">
      {projects.map((project) => (
        <span key={project} className={KEY_ITEM}>
          <span
            aria-hidden
            className="h-[11px] w-[11px] shrink-0 rounded-[3px]"
            style={{ backgroundColor: accentFor(project) }}
          />
          <span className="max-w-[160px] truncate">{project}</span>
        </span>
      ))}
      {projects.length > 0 && (
        <span aria-hidden className="h-[12px] w-px shrink-0 bg-[var(--border)]" />
      )}
      {STATE_KEYS.map((key) => (
        <span key={key.label} className={KEY_ITEM}>
          <span aria-hidden className={KEY_SHAPE} style={key.style} />
          {key.label}
        </span>
      ))}
    </div>
  );
}
