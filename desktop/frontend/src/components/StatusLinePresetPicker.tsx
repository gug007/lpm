import {
  Check,
  Gauge,
  Minimize2,
  SlidersHorizontal,
  Sparkles,
  Terminal,
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";

export type StatusLineTemplateId =
  | "current"
  | "minimal"
  | "context"
  | "meters"
  | "vibrant"
  | "custom"
  | "ai";

export const STATUSLINE_LABELS: Record<StatusLineTemplateId, string> = {
  current: "My status line",
  minimal: "Minimalistic",
  context: "Context",
  meters: "Clean",
  vibrant: "Modern",
  custom: "Custom",
  ai: "AI edited",
};

export interface StatusLinePresetPickerProps {
  selected: StatusLineTemplateId;
  hasCustom: boolean;
  disabled: boolean;
  onSelect: (id: StatusLineTemplateId) => void;
}

const PRESETS = [
  {
    id: "current",
    hint: "Keep your existing setup",
    icon: Terminal,
  },
  {
    id: "meters",
    hint: "Usage, limits & cost",
    icon: Gauge,
  },
  {
    id: "minimal",
    hint: "Quiet, neutral usage view",
    icon: Minimize2,
  },
  {
    id: "vibrant",
    hint: "Colorful with emojis",
    icon: Sparkles,
  },
  {
    id: "custom",
    hint: "Build every detail yourself",
    icon: SlidersHorizontal,
  },
] as const;

function presetSample(
  id: (typeof PRESETS)[number]["id"],
  hasCustom: boolean,
): ReactNode {
  if (id === "current") {
    if (!hasCustom) {
      return (
        <span className="font-mono text-[10px] text-[var(--text-muted)]">
          Status line hidden
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1.5 font-mono text-[10px]">
        <span className="text-[var(--text-muted)]">❯</span>
        <span className="text-[var(--text-secondary)]">~/project</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text-secondary)]">Opus 4.8</span>
      </div>
    );
  }

  if (id === "meters") {
    return (
      <div className="flex w-full items-center gap-1.5 font-mono text-[9.5px]">
        <span className="shrink-0 text-[var(--text-muted)]">5h</span>
        <span className="flex min-w-0 flex-1 gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((bar) => (
            <span
              key={bar}
              className={`h-1.5 flex-1 rounded-[2px] ${bar < 4 ? "bg-[var(--accent-green)]" : "bg-[var(--bg-active)]"}`}
            />
          ))}
        </span>
        <span className="shrink-0 text-[var(--accent-green-text)]">64%</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="shrink-0 text-[var(--accent-amber)]">$4.20</span>
      </div>
    );
  }

  if (id === "minimal") {
    return (
      <div className="flex w-full items-center gap-1.5 font-mono text-[9.5px] text-[var(--text-muted)]">
        <span className="shrink-0 text-[var(--text-secondary)]">project</span>
        <span>·</span>
        <span className="shrink-0 text-[var(--text-secondary)]">Opus</span>
        <span>·</span>
        <span className="shrink-0">5h</span>
        <span className="flex min-w-5 flex-1 overflow-hidden rounded-full bg-[var(--bg-active)]">
          <span className="h-1 w-[34%] rounded-full bg-[var(--text-secondary)]" />
        </span>
        <span className="shrink-0 text-[var(--text-secondary)]">34%</span>
        <span>·</span>
        <span className="shrink-0 text-[var(--text-secondary)]">$4.20</span>
      </div>
    );
  }

  if (id === "vibrant") {
    return (
      <div className="flex min-w-0 items-center gap-1 font-mono text-[9px]">
        <span>📁</span>
        <span className="truncate text-[var(--accent-blue)]">project</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span>✳️</span>
        <span className="truncate text-[var(--accent-amber)]">Opus</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span>💰</span>
        <span className="shrink-0 text-[var(--accent-amber)]">$4.20</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[9.5px]">
      <span className="rounded bg-[var(--bg-active)] px-1.5 py-0.5 text-[var(--text-secondary)]">
        Folder
      </span>
      <span className="rounded bg-[var(--accent-amber)]/12 px-1.5 py-0.5 text-[var(--accent-amber)]">
        Model
      </span>
      <span className="rounded border border-dashed border-[var(--border)] px-1.5 py-0.5 text-[var(--text-muted)]">
        + Add
      </span>
    </div>
  );
}

export function StatusLinePresetPicker({
  selected,
  hasCustom,
  disabled,
  onSelect,
}: StatusLinePresetPickerProps) {
  const hasVisibleSelection = PRESETS.some((preset) => preset.id === selected);

  const onPresetKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % PRESETS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + PRESETS.length) % PRESETS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = PRESETS.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const next = event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
      .item(nextIndex);
    next?.focus();
    onSelect(PRESETS[nextIndex].id);
  };

  return (
    <div
      role="radiogroup"
      className="grid gap-2"
      style={{
        gridTemplateColumns:
          "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
      }}
      aria-label="Status line templates"
    >
      {PRESETS.map((preset, index) => {
        const active = selected === preset.id;
        const Icon = preset.icon;
        const label =
          preset.id === "current" && !hasCustom
            ? "Off"
            : STATUSLINE_LABELS[preset.id];
        const hint =
          preset.id === "current" && !hasCustom
            ? "Keep the status line hidden"
            : preset.hint;

        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            disabled={disabled}
            role="radio"
            aria-checked={active}
            tabIndex={active || (!hasVisibleSelection && index === 0) ? 0 : -1}
            onKeyDown={(event) => onPresetKeyDown(event, index)}
            className={`group relative flex min-h-[92px] flex-col overflow-hidden rounded-xl border p-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-[var(--accent-green)] bg-[var(--accent-green)]/8 shadow-[0_0_0_1px_var(--accent-green)]"
                : "border-[var(--border)] bg-[var(--bg-secondary)]/40 hover:-translate-y-px hover:border-[var(--text-muted)]/45 hover:bg-[var(--bg-hover)] hover:shadow-sm"
            }`}
          >
            <div className="flex w-full items-start gap-2">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors ${
                  active
                    ? "bg-[var(--accent-green)]/15 text-[var(--accent-green-text)]"
                    : "bg-[var(--bg-active)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon aria-hidden className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">
                  {label}
                </span>
                <span className="block truncate text-[10px] text-[var(--text-muted)]">
                  {hint}
                </span>
              </span>
              <span
                aria-hidden
                className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border transition-all ${
                  active
                    ? "border-[var(--accent-green)] bg-[var(--accent-green)] text-green-950"
                    : "border-[var(--border)] text-transparent group-hover:border-[var(--text-muted)]/60"
                }`}
              >
                <Check className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
            </div>
            <span
              aria-hidden
              className="mt-auto flex min-h-6 w-full items-center overflow-hidden rounded-md border border-[var(--border)]/80 bg-[var(--bg-primary)]/70 px-2"
            >
              {presetSample(preset.id, hasCustom)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
