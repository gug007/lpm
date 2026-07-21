import {
  Brain,
  Check,
  Gauge,
  Minimize2,
  SlidersHorizontal,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";

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
  minimal: "Minimal",
  context: "Context",
  meters: "Usage & cost",
  vibrant: "Custom",
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
    id: "minimal",
    hint: "Just folder and model",
    icon: Minimize2,
  },
  {
    id: "context",
    hint: "Folder, model & context left",
    icon: Brain,
  },
  {
    id: "meters",
    hint: "5-hour, weekly usage & cost",
    icon: Gauge,
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

  if (id === "minimal") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[10px]">
        <span className="text-[var(--text-secondary)]">~/project</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text-secondary)]">Opus 4.8</span>
      </div>
    );
  }

  if (id === "context") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[10px]">
        <span className="text-[var(--text-secondary)]">~/project</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--text-secondary)]">Opus 4.8</span>
        <span className="text-[var(--text-muted)]">·</span>
        <span className="text-[var(--accent-green-text)]">⌁ 62%</span>
      </div>
    );
  }

  if (id === "meters") {
    return (
      <div className="flex w-full items-center gap-2 font-mono text-[9.5px]">
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
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-[9.5px]">
      <span className="rounded bg-[var(--accent-blue)]/12 px-1.5 py-0.5 text-[var(--accent-blue)]">
        Folder
      </span>
      <span className="rounded bg-[var(--accent-cyan)]/12 px-1.5 py-0.5 text-[var(--accent-cyan)]">
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
  return (
    <div
      role="radiogroup"
      className="grid grid-cols-2 gap-1.5 min-[700px]:grid-cols-3 min-[1000px]:grid-cols-5"
      aria-label="Status line templates"
    >
      {PRESETS.map((preset) => {
        const active =
          selected === preset.id ||
          (selected === "vibrant" && preset.id === "custom");
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
            className={`group relative flex min-h-[88px] flex-col overflow-hidden rounded-lg border p-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
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
                <span className="block truncate text-[11.5px] font-semibold text-[var(--text-primary)]">
                  {label}
                </span>
                <span className="block truncate text-[9.5px] text-[var(--text-muted)]">
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
