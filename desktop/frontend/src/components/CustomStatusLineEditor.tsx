import { useState } from "react";
import { ChevronUp, ChevronDown, Plus, X, Minus } from "lucide-react";

export type SegmentId =
  | "folder"
  | "path"
  | "model"
  | "branch"
  | "ctx"
  | "five"
  | "seven"
  | "cost"
  | "text";

export type SegColor =
  | "default"
  | "dim"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan";

export interface Segment {
  id: SegmentId;
  color: SegColor;
  text: string;
}

export interface CustomSpec {
  segments: Segment[];
  separator: string;
  meterStyle: "bar" | "percent";
  meterWidth: number;
}

const ADDABLE: SegmentId[] = ["folder", "path", "model", "branch", "ctx", "five", "seven", "cost"];

const LABELS: Record<SegmentId, string> = {
  folder: "Folder",
  path: "Full path",
  model: "Model",
  branch: "Git branch",
  ctx: "Context left",
  five: "5-hour usage",
  seven: "Weekly usage",
  cost: "Session cost",
  text: "Text",
};

const SEPARATORS = ["·", "|", "›", "/", "—"];

const COLORS: { id: SegColor; swatch: string }[] = [
  { id: "default", swatch: "var(--text-secondary)" },
  { id: "dim", swatch: "var(--text-muted)" },
  { id: "red", swatch: "#cc4b4b" },
  { id: "green", swatch: "#4e9a06" },
  { id: "yellow", swatch: "#c4a000" },
  { id: "blue", swatch: "#3465a4" },
  { id: "magenta", swatch: "#a349a4" },
  { id: "cyan", swatch: "#06989a" },
];

export function CustomStatusLineEditor({
  spec,
  onChange,
  disabled,
}: {
  spec: CustomSpec;
  onChange: (spec: CustomSpec) => void;
  disabled: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const used = new Set(spec.segments.map((s) => s.id));
  const remaining = ADDABLE.filter((id) => !used.has(id));
  const showMeter = spec.segments.some((s) => s.id === "five" || s.id === "seven");

  const setSegments = (segments: Segment[]) => onChange({ ...spec, segments });

  const move = (index: number, delta: number) => {
    const next = [...spec.segments];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSegments(next);
  };

  const remove = (index: number) => {
    if (spec.segments.length === 1) return;
    setSegments(spec.segments.filter((_, i) => i !== index));
  };

  const update = (index: number, patch: Partial<Segment>) => {
    setSegments(spec.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const add = (id: SegmentId) => {
    setAddOpen(false);
    setSegments([...spec.segments, { id, color: "default", text: "" }]);
  };

  return (
    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-3">
      <div className="space-y-1">
        {spec.segments.map((segment, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md px-1.5 py-1">
            <div className="flex flex-col">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={disabled || i === 0}
                aria-label="Move up"
                className="flex h-3.5 w-4 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-25"
              >
                <ChevronUp size={12} />
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={disabled || i === spec.segments.length - 1}
                aria-label="Move down"
                className="flex h-3.5 w-4 items-center justify-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-25"
              >
                <ChevronDown size={12} />
              </button>
            </div>

            {segment.id === "text" ? (
              <input
                value={segment.text}
                onChange={(e) => update(i, { text: e.target.value })}
                disabled={disabled}
                placeholder="Your text…"
                className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
              />
            ) : (
              <span className="flex-1 text-[12px] text-[var(--text-primary)]">{LABELS[segment.id]}</span>
            )}

            <ColorSwatches
              value={segment.color}
              disabled={disabled}
              onChange={(color) => update(i, { color })}
            />

            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled || spec.segments.length === 1}
              aria-label={`Remove ${LABELS[segment.id]}`}
              className="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-25"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <div className="relative mt-1">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          disabled={disabled}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <Plus size={13} /> Add
        </button>
        {addOpen && (
          <div className="absolute z-10 mt-1 w-44 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-1 shadow-lg">
            {remaining.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => add(id)}
                className="block w-full px-3 py-1.5 text-left text-[12px] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
              >
                {LABELS[id]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => add("text")}
              className="block w-full border-t border-[var(--border)] px-3 py-1.5 text-left text-[12px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
            >
              Text…
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">Separator</span>
          <input
            value={spec.separator}
            onChange={(e) => onChange({ ...spec, separator: e.target.value })}
            disabled={disabled}
            maxLength={3}
            aria-label="Separator"
            className="w-12 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-center text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
          />
          <div className="flex items-center gap-1">
            {SEPARATORS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...spec, separator: s })}
                disabled={disabled}
                className={`flex h-6 w-6 items-center justify-center rounded font-mono text-[12px] transition-colors ${
                  spec.separator === s
                    ? "bg-[var(--accent-green)]/15 text-[var(--text-primary)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {showMeter && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Usage as</span>
              <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
                {(["bar", "percent"] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...spec, meterStyle: style })}
                    className={`px-2.5 py-1 text-[11px] transition-colors ${
                      spec.meterStyle === style
                        ? "bg-[var(--accent-green)]/15 text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {style === "bar" ? "Bars" : "Numbers"}
                  </button>
                ))}
              </div>
            </div>

            {spec.meterStyle === "bar" && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[var(--text-muted)]">Bar width</span>
                <Stepper
                  value={spec.meterWidth}
                  min={3}
                  max={16}
                  disabled={disabled}
                  onChange={(meterWidth) => onChange({ ...spec, meterWidth })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ColorSwatches({
  value,
  disabled,
  onChange,
}: {
  value: SegColor;
  disabled: boolean;
  onChange: (c: SegColor) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {COLORS.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c.id)}
          aria-label={c.id}
          title={c.id}
          className={`flex h-4 w-4 items-center justify-center rounded-full transition-transform hover:scale-110 ${
            value === c.id ? "ring-2 ring-[var(--accent-green)] ring-offset-1 ring-offset-[var(--bg-secondary)]" : ""
          }`}
        >
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{
              background: c.id === "default" ? "transparent" : c.swatch,
              border: c.id === "default" ? "1px solid var(--text-muted)" : undefined,
            }}
          />
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center overflow-hidden rounded-md border border-[var(--border)]">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label="Narrower"
        className="flex h-6 w-6 items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
      >
        <Minus size={12} />
      </button>
      <span className="w-6 text-center text-[11px] tabular-nums text-[var(--text-primary)]">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Wider"
        className="flex h-6 w-6 items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
