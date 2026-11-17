import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import { AnsiLine } from "./AnsiLine";
import { StatusLineChoiceRow } from "./StatusLineChoiceRow";
import { CARD_CLASS } from "./ui/fields";

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

export type StatusLineSamples = Partial<Record<StatusLineTemplateId, string>>;

export interface StatusLinePresetPickerProps {
  selected: StatusLineTemplateId;
  hasCustom: boolean;
  disabled: boolean;
  onSelect: (id: StatusLineTemplateId) => void;
  samples?: StatusLineSamples;
  terminalStyle?: CSSProperties;
}

const PRESETS = [
  {
    id: "meters",
    hint: "Usage, limits & cost",
  },
  {
    id: "minimal",
    hint: "Quiet, neutral usage view",
  },
  {
    id: "vibrant",
    hint: "Colorful with emojis",
  },
  {
    id: "custom",
    hint: "Arrange every item in the builder below",
  },
  {
    id: "current",
    hint: "Keep your existing setup",
  },
] as const;

function presetSample(id: (typeof PRESETS)[number]["id"]): ReactNode {
  if (id === "current") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="opacity-45">❯</span>
        <span className="opacity-80">~/project</span>
        <span className="opacity-40">·</span>
        <span className="opacity-80">Opus 4.8</span>
      </span>
    );
  }

  if (id === "meters") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="opacity-60">5h</span>
        <span className="flex w-16 gap-0.5" aria-hidden>
          {[0, 1, 2, 3, 4, 5].map((bar) => (
            <span
              key={bar}
              className={`h-1.5 flex-1 rounded-[2px] ${bar < 4 ? "bg-[var(--accent-green)]" : "bg-current/20"}`}
            />
          ))}
        </span>
        <span className="text-[var(--accent-green-text)]">64%</span>
        <span className="opacity-40">·</span>
        <span className="text-[var(--accent-amber)]">$4.20</span>
      </span>
    );
  }

  if (id === "minimal") {
    return (
      <span className="flex items-center gap-1.5">
        <span className="opacity-80">project</span>
        <span className="opacity-40">·</span>
        <span className="opacity-80">Opus</span>
        <span className="opacity-40">·</span>
        <span className="opacity-60">5h</span>
        <span className="flex h-1 w-12 overflow-hidden rounded-full bg-current/20">
          <span className="h-1 w-[34%] rounded-full bg-current opacity-70" />
        </span>
        <span className="opacity-80">34%</span>
        <span className="opacity-40">·</span>
        <span className="opacity-80">$4.20</span>
      </span>
    );
  }

  if (id === "vibrant") {
    return (
      <span className="flex items-center gap-1">
        <span>📁</span>
        <span className="text-[var(--accent-blue)]">project</span>
        <span className="opacity-40">·</span>
        <span>✳️</span>
        <span className="text-[var(--accent-amber)]">Opus</span>
        <span className="opacity-40">·</span>
        <span>💰</span>
        <span className="text-[var(--accent-amber)]">$4.20</span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 font-sans text-[11px]">
      <span className="rounded bg-current/12 px-1.5 py-px opacity-85">Folder</span>
      <span className="rounded bg-current/12 px-1.5 py-px opacity-85">Model</span>
      <span className="rounded border border-dashed border-current/30 px-1.5 py-px opacity-60">
        + Add item
      </span>
    </span>
  );
}

export function StatusLinePresetPicker({
  selected,
  hasCustom,
  disabled,
  onSelect,
  samples = {},
  terminalStyle,
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
      aria-label="Status line templates"
      className={`${CARD_CLASS} divide-y divide-[var(--border)] overflow-hidden`}
    >
      {PRESETS.map((preset, index) => {
        const active = selected === preset.id;
        const off = preset.id === "current" && !hasCustom;
        const sample = off ? "" : (samples[preset.id] ?? "").trim();
        return (
          <StatusLineChoiceRow
            key={preset.id}
            active={active}
            disabled={disabled}
            label={off ? "Off" : STATUSLINE_LABELS[preset.id]}
            hint={off ? "Keep the status line hidden" : preset.hint}
            sampleStyle={terminalStyle}
            sample={off ? null : sample ? <AnsiLine text={sample} /> : presetSample(preset.id)}
            tabIndex={active || (!hasVisibleSelection && index === 0) ? 0 : -1}
            onClick={() => onSelect(preset.id)}
            onKeyDown={(event) => onPresetKeyDown(event, index)}
          />
        );
      })}
    </div>
  );
}
