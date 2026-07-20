import { useState } from "react";
import { X, Plus, Sparkles, GripVertical } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  | "cyan"
  | "claude";

export interface Segment {
  id: SegmentId;
  color: SegColor;
  text: string;
}

export type MeterStyle = "bar" | "blocks" | "dots" | "percent";

export interface CustomSpec {
  segments: Segment[];
  separator: string;
  meterStyle: MeterStyle;
  meterWidth: number;
  icons: boolean;
  gitStatus: boolean;
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

// Mirrors the emoji the backend prepends (hooks.rs segment_icon) so a chip looks
// like the token it produces once icons are on.
const ICONS: Record<SegmentId, string> = {
  folder: "📁",
  path: "📂",
  model: "✦",
  branch: "🌿",
  ctx: "🧠",
  five: "⚡",
  seven: "📆",
  cost: "💰",
  text: "",
};

const SEPARATORS = ["·", "|", "›", "/", "—"];

const COLORS: { id: SegColor; swatch: string; label: string }[] = [
  { id: "default", swatch: "var(--text-secondary)", label: "Default" },
  { id: "dim", swatch: "var(--text-muted)", label: "Dim" },
  { id: "red", swatch: "#cc4b4b", label: "Red" },
  { id: "green", swatch: "#4e9a06", label: "Green" },
  { id: "yellow", swatch: "#c4a000", label: "Yellow" },
  { id: "blue", swatch: "#3465a4", label: "Blue" },
  { id: "magenta", swatch: "#a349a4", label: "Magenta" },
  { id: "cyan", swatch: "#06989a", label: "Cyan" },
  { id: "claude", swatch: "#d97757", label: "Claude" },
];

const METER_STYLES: { id: MeterStyle; label: string; sample: string }[] = [
  { id: "bar", label: "Bars", sample: "━━╸━" },
  { id: "blocks", label: "Blocks", sample: "▇▇▃▁" },
  { id: "dots", label: "Dots", sample: "●●○○" },
  { id: "percent", label: "Numbers", sample: "47%" },
];

function colorHex(c: SegColor): string {
  return COLORS.find((x) => x.id === c)?.swatch ?? "var(--text-secondary)";
}

const rand = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export function CustomStatusLineEditor({
  spec,
  onChange,
  disabled,
}: {
  spec: CustomSpec;
  onChange: (spec: CustomSpec) => void;
  disabled: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const used = new Set(spec.segments.map((s) => s.id));
  const addable = ADDABLE.filter((id) => !used.has(id));
  const showMeter = spec.segments.some((s) => s.id === "five" || s.id === "seven");
  const hasBranch = spec.segments.some((s) => s.id === "branch");

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = spec.segments.map((_, i) => String(i));

  const setSegments = (segments: Segment[]) => onChange({ ...spec, segments });

  const update = (index: number, patch: Partial<Segment>) =>
    setSegments(spec.segments.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const remove = (index: number) => {
    setSegments(spec.segments.filter((_, i) => i !== index));
    setSelected(null);
  };

  const add = (id: SegmentId) => {
    setSegments([...spec.segments, { id, color: "default", text: "" }]);
    setSelected(spec.segments.length);
  };

  const onDragStart = (e: DragStartEvent) => setDragIndex(Number(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragIndex(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSegments(arrayMove(spec.segments, Number(active.id), Number(over.id)));
    setSelected(null);
  };

  // A tasteful random line — folder + model anchor it, a few extras join, icons on.
  const surprise = () => {
    const accents: SegColor[] = ["cyan", "green", "magenta", "blue", "yellow"];
    const optional: SegmentId[] = ["ctx", "five", "seven", "cost", "branch"];
    const chosen: SegmentId[] = ["folder", "model", ...optional.filter(() => Math.random() > 0.45)];
    if (!chosen.includes("five") && !chosen.includes("seven")) chosen.push("five");
    const segments: Segment[] = chosen.map((id) => ({
      id,
      text: "",
      color: Math.random() > 0.3 ? rand(accents) : "default",
    }));
    onChange({
      segments,
      separator: rand(SEPARATORS),
      meterStyle: rand(["bar", "blocks", "dots"] as const),
      meterWidth: rand([5, 7, 9]),
      icons: true,
      gitStatus: chosen.includes("branch"),
    });
    setSelected(null);
  };

  const active = selected != null ? spec.segments[selected] : undefined;

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-muted)]">
          Your segments
        </span>
        <button
          type="button"
          onClick={surprise}
          disabled={disabled}
          className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-blue)]/50 hover:text-[var(--text-primary)] disabled:opacity-40"
          title="Shuffle a fresh combination"
        >
          <Sparkles size={12} /> Surprise me
        </button>
      </div>

      {/* The chip canvas — drag to reorder, click to edit. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragIndex(null)}
      >
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-primary)]/40 p-2">
            {spec.segments.map((segment, i) => (
              <SortableChip
                key={i}
                id={String(i)}
                segment={segment}
                showIcon={spec.icons}
                selected={selected === i}
                disabled={disabled}
                onSelect={() => setSelected(selected === i ? null : i)}
              />
            ))}
            {spec.segments.length === 0 && (
              <span className="px-1 py-1 text-[11px] text-[var(--text-muted)]">
                Add a segment below to begin.
              </span>
            )}
          </div>
        </SortableContext>
        <DragOverlay>
          {dragIndex != null && spec.segments[dragIndex] ? (
            <Chip segment={spec.segments[dragIndex]} showIcon={spec.icons} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Add palette — every remaining segment, one click away. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-[var(--text-muted)]">Add</span>
        {addable.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => add(id)}
            disabled={disabled}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-green)]/50 hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <Plus size={11} />
            <span aria-hidden>{ICONS[id]}</span> {LABELS[id]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => add("text")}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <Plus size={11} /> Text…
        </button>
      </div>

      {/* Inline editor for the chip you tapped. */}
      {active && (
        <div className="mt-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/60 p-2.5">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">
              Editing <span className="text-[var(--text-secondary)]">{LABELS[active.id]}</span>
            </span>
            <button
              type="button"
              onClick={() => remove(selected!)}
              className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition-colors hover:bg-[var(--accent-red)]/12 hover:text-[var(--accent-red-text,#cc4b4b)]"
            >
              <X size={12} /> Remove
            </button>
          </div>

          {active.id === "text" && (
            <input
              value={active.text}
              onChange={(e) => update(selected!, { text: e.target.value })}
              disabled={disabled}
              autoFocus
              placeholder="Your text…"
              className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-green)]"
            />
          )}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">Color</span>
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => update(selected!, { color: c.id })}
                  aria-label={c.label}
                  title={c.label}
                  className={`flex h-5 w-5 items-center justify-center rounded-full transition-transform hover:scale-110 ${
                    active.color === c.id
                      ? "ring-2 ring-[var(--accent-green)] ring-offset-1 ring-offset-[var(--bg-primary)]"
                      : ""
                  }`}
                >
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{
                      background: c.id === "default" ? "transparent" : c.swatch,
                      border: c.id === "default" ? "1px solid var(--text-muted)" : undefined,
                    }}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Options — the knobs that shape the whole line. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-[var(--border)] pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[var(--text-muted)]">Icons</span>
          <ToggleSwitch
            on={spec.icons}
            disabled={disabled}
            label="Icons"
            onChange={(v) => onChange({ ...spec, icons: v })}
          />
        </div>

        {hasBranch && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)]">Git status</span>
            <ToggleSwitch
              on={spec.gitStatus}
              disabled={disabled}
              label="Git status"
              onChange={(v) => onChange({ ...spec, gitStatus: v })}
            />
          </div>
        )}

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
                {METER_STYLES.map((style) => (
                  <button
                    key={style.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange({ ...spec, meterStyle: style.id })}
                    title={style.sample}
                    className={`px-2.5 py-1 text-[11px] transition-colors ${
                      spec.meterStyle === style.id
                        ? "bg-[var(--accent-green)]/15 text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
                    }`}
                  >
                    {style.label}
                  </button>
                ))}
              </div>
            </div>

            {spec.meterStyle !== "percent" && (
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

function SortableChip({
  id,
  segment,
  showIcon,
  selected,
  disabled,
  onSelect,
}: {
  id: string;
  segment: Segment;
  showIcon: boolean;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={style}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`inline-flex touch-none items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] text-[var(--text-primary)] transition-colors ${
        disabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      } ${
        selected
          ? "border-[var(--accent-green)] bg-[var(--accent-green)]/10"
          : "border-[var(--border)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <GripVertical size={11} className="text-[var(--text-muted)]" />
      <ChipBody segment={segment} showIcon={showIcon} />
    </button>
  );
}

function Chip({ segment, showIcon, dragging }: { segment: Segment; showIcon: boolean; dragging?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-green)] bg-[var(--bg-secondary)] px-2.5 py-1 text-[12px] text-[var(--text-primary)] ${
        dragging ? "shadow-lg" : ""
      }`}
    >
      <GripVertical size={11} className="text-[var(--text-muted)]" />
      <ChipBody segment={segment} showIcon={showIcon} />
    </span>
  );
}

function ChipBody({ segment, showIcon }: { segment: Segment; showIcon: boolean }) {
  const label = segment.id === "text" ? segment.text || "Text" : LABELS[segment.id];
  const icon = ICONS[segment.id];
  return (
    <>
      {showIcon && icon && <span aria-hidden>{icon}</span>}
      <span className="max-w-[9rem] truncate">{label}</span>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{
          background: segment.color === "default" ? "transparent" : colorHex(segment.color),
          border: segment.color === "default" ? "1px solid var(--text-muted)" : undefined,
        }}
      />
    </>
  );
}

function ToggleSwitch({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-4 w-7 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        on ? "bg-[var(--accent-green)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all ${
          on ? "left-3.5" : "left-0.5"
        }`}
      />
    </button>
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
        <span className="text-[13px] leading-none">−</span>
      </button>
      <span className="w-6 text-center text-[11px] tabular-nums text-[var(--text-primary)]">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label="Wider"
        className="flex h-6 w-6 items-center justify-center text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-30"
      >
        <span className="text-[13px] leading-none">+</span>
      </button>
    </div>
  );
}
