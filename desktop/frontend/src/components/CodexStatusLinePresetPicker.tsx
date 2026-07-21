import {
  Check,
  EyeOff,
  Gauge,
  GitBranch,
  Layers3,
  Minimize2,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import {
  CODEX_DEFAULT_STATUS_LINE,
  codexStatusLineOption,
} from "./codexStatusLineOptions";

export type CodexStatusLinePresetId =
  | "essential"
  | "project"
  | "usage"
  | "detailed"
  | "off";

export interface CodexStatusLinePreset {
  id: CodexStatusLinePresetId;
  label: string;
  hint: string;
  items: readonly string[];
  icon: typeof Minimize2;
}

export const CODEX_STATUS_LINE_PRESETS: CodexStatusLinePreset[] = [
  {
    id: "essential",
    label: "Essential",
    hint: "Model and working directory",
    items: CODEX_DEFAULT_STATUS_LINE,
    icon: Minimize2,
  },
  {
    id: "project",
    label: "Project",
    hint: "Repo state and context",
    items: [
      "project-name",
      "git-branch",
      "branch-changes",
      "context-remaining",
    ],
    icon: GitBranch,
  },
  {
    id: "usage",
    label: "Usage",
    hint: "Context and account limits",
    items: [
      "model-with-reasoning",
      "context-remaining",
      "five-hour-limit",
      "weekly-limit",
      "fast-mode",
    ],
    icon: Gauge,
  },
  {
    id: "detailed",
    label: "Detailed",
    hint: "A fuller working-session view",
    items: [
      "model-with-reasoning",
      "current-dir",
      "git-branch",
      "run-state",
      "context-remaining",
      "five-hour-limit",
      "weekly-limit",
      "task-progress",
    ],
    icon: Layers3,
  },
  {
    id: "off",
    label: "Off",
    hint: "Hide the configurable footer",
    items: [],
    icon: EyeOff,
  },
];

function sameItems(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  );
}

export function codexStatusLinePresetId(
  items: readonly string[],
): CodexStatusLinePresetId | null {
  return (
    CODEX_STATUS_LINE_PRESETS.find((preset) => sameItems(preset.items, items))
      ?.id ?? null
  );
}

function presetSample(preset: CodexStatusLinePreset) {
  if (preset.items.length === 0) {
    return (
      <span className="font-mono text-[10px] text-[var(--text-muted)]">
        Status line hidden
      </span>
    );
  }
  const visible = preset.items.slice(0, 3);
  return (
    <span className="flex min-w-0 items-center gap-1 font-mono text-[9px] text-[var(--text-secondary)]">
      {visible.map((item, index) => (
        <span key={item} className="contents">
          {index > 0 && (
            <span className="text-[var(--text-muted)]">·</span>
          )}
          <span className="max-w-24 truncate">
            {codexStatusLineOption(item).preview}
          </span>
        </span>
      ))}
      {preset.items.length > visible.length && (
        <span className="text-[var(--text-muted)]">…</span>
      )}
    </span>
  );
}

export function CodexStatusLinePresetPicker({
  items,
  disabled,
  onSelect,
}: {
  items: readonly string[];
  disabled: boolean;
  onSelect: (items: string[]) => void;
}) {
  const selected = codexStatusLinePresetId(items);

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % CODEX_STATUS_LINE_PRESETS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (index - 1 + CODEX_STATUS_LINE_PRESETS.length) %
        CODEX_STATUS_LINE_PRESETS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = CODEX_STATUS_LINE_PRESETS.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const next = event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
      .item(nextIndex);
    next?.focus();
    onSelect([...CODEX_STATUS_LINE_PRESETS[nextIndex].items]);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Codex status line layouts"
      className="grid gap-2"
      style={{
        gridTemplateColumns:
          "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
      }}
    >
      {CODEX_STATUS_LINE_PRESETS.map((preset, index) => {
        const active = selected === preset.id;
        const Icon = preset.icon;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (selected == null && index === 0) ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect([...preset.items])}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`group relative flex min-h-[92px] flex-col overflow-hidden rounded-xl border p-2.5 text-left transition-[border-color,background-color,box-shadow,transform] duration-150 motion-reduce:transform-none motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-green)]/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "border-[var(--accent-green)] bg-[var(--accent-green)]/8 shadow-[0_0_0_1px_var(--accent-green)]"
                : "border-[var(--border)] bg-[var(--bg-secondary)]/40 hover:-translate-y-px hover:border-[var(--text-muted)]/45 hover:bg-[var(--bg-hover)] hover:shadow-sm"
            }`}
          >
            <span className="flex w-full items-start gap-2">
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
                  {preset.label}
                </span>
                <span className="block truncate text-[10px] text-[var(--text-muted)]">
                  {preset.hint}
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
            </span>
            <span
              aria-hidden
              className="mt-auto flex min-h-6 w-full items-center overflow-hidden rounded-md border border-[var(--border)]/80 bg-[var(--bg-primary)]/70 px-2"
            >
              {presetSample(preset)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
