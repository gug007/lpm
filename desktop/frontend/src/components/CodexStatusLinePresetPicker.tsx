import type { CSSProperties, KeyboardEvent } from "react";
import type { CodexStatusLineColorScheme } from "./codexStatusLineColors";
import { CodexStatusLineItems } from "./CodexStatusLineItems";
import { StatusLineChoiceRow } from "./StatusLineChoiceRow";
import { CODEX_DEFAULT_STATUS_LINE } from "./codexStatusLineOptions";
import { CARD_CLASS } from "./ui/fields";

export type CodexStatusLinePresetId =
  | "default"
  | "project"
  | "usage"
  | "detailed"
  | "off";

export type CodexStatusLineChoiceId = CodexStatusLinePresetId | "custom";

export interface CodexStatusLinePreset {
  id: CodexStatusLinePresetId;
  label: string;
  hint: string;
  items: readonly string[];
}

export const CODEX_STATUS_LINE_PRESETS: CodexStatusLinePreset[] = [
  {
    id: "default",
    label: "Codex default",
    hint: "Model, folder and thread name",
    items: CODEX_DEFAULT_STATUS_LINE,
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
  },
  {
    id: "off",
    label: "Off",
    hint: "No status line under the prompt",
    items: [],
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

export function codexStatusLineChoiceId(
  items: readonly string[],
  configured: boolean,
): CodexStatusLineChoiceId {
  if (!configured) return "default";
  return codexStatusLinePresetId(items) ?? "custom";
}

interface Choice {
  id: CodexStatusLineChoiceId;
  label: string;
  hint: string;
  items: readonly string[];
}

export function CodexStatusLinePresetPicker({
  items,
  configured,
  customItems,
  disabled,
  useColors,
  colorScheme,
  terminalStyle,
  onSelect,
  onReset,
}: {
  items: readonly string[];
  configured: boolean;
  customItems: readonly string[];
  disabled: boolean;
  useColors: boolean;
  colorScheme: CodexStatusLineColorScheme;
  terminalStyle?: CSSProperties;
  onSelect: (items: string[]) => void;
  onReset: () => void;
}) {
  const selected = codexStatusLineChoiceId(items, configured);
  const customSample = selected === "custom" ? items : customItems;
  const choices: Choice[] = [...CODEX_STATUS_LINE_PRESETS];
  if (customSample.length > 0) {
    choices.push({
      id: "custom",
      label: "Custom",
      hint: `${customSample.length} ${customSample.length === 1 ? "item" : "items"}, arranged by you`,
      items: customSample,
    });
  }

  const activate = (choice: Choice) => {
    if (choice.id === selected) return;
    if (choice.id === "default") onReset();
    else onSelect([...choice.items]);
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (index + 1) % choices.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (index - 1 + choices.length) % choices.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = choices.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    const next = event.currentTarget
      .closest('[role="radiogroup"]')
      ?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
      .item(nextIndex);
    next?.focus();
    activate(choices[nextIndex]);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Codex status line layouts"
      className={`${CARD_CLASS} divide-y divide-[var(--border)] overflow-hidden`}
    >
      {choices.map((choice, index) => {
        const active = selected === choice.id;
        return (
          <StatusLineChoiceRow
            key={choice.id}
            active={active}
            disabled={disabled}
            label={choice.label}
            hint={choice.hint}
            sample={
              choice.items.length > 0 ? (
                <CodexStatusLineItems items={choice.items} useColors={useColors} scheme={colorScheme} />
              ) : null
            }
            sampleStyle={terminalStyle}
            tabIndex={active ? 0 : -1}
            onClick={() => activate(choice)}
            onKeyDown={(event) => onKeyDown(event, index)}
          />
        );
      })}
    </div>
  );
}
