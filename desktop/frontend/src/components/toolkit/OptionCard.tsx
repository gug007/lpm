import type { ReactNode } from "react";

export const LABEL = "text-[11.5px] text-[var(--text-muted)]";

export const NOTE = "text-[10px] text-[var(--text-muted)]";

export function noteClass(mono?: boolean) {
  return `${NOTE} ${mono ? "truncate font-mono" : "leading-snug"}`;
}

const CARD =
  "flex min-w-0 items-start gap-[7px] rounded-[var(--tk-radius-s)] px-2 py-1.5 text-left transition-[background-color,box-shadow]";

// Selection is a chromatic wash under a ring. The neutral fills in this pane
// mean "this one is not loading", so a tinted one cannot be mistaken for them —
// and a filled row is answerable at a glance where an outline needs a look.
// One hue for both questions: they are the same act. Green is left to mean
// running and healthy, which is what it means everywhere else in lpm.
const SELECTED =
  "bg-[color-mix(in_srgb,var(--accent-blue)_10%,transparent)] shadow-[inset_0_0_0_1.5px_var(--accent-blue)]";

// The folder is the answer the tint belongs to; under "Who runs it" the wash
// already marks the choice, so the title stays ink rather than saying it twice.
const TITLE_ON = {
  dest: "text-[var(--accent-blue-text)]",
  mode: "text-[var(--text-primary)]",
} as const;

export type OptionTone = keyof typeof TITLE_ON;

const PLATE = "mt-px grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px]";

const PLATE_TONE = {
  claude:
    "bg-[color-mix(in_srgb,var(--accent-claude)_22%,transparent)] text-[var(--accent-claude-text)]",
  agents: "bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-secondary)]",
} as const;

export type MarkKind = "claude" | "codex" | "shared" | "prompt";

// Which CLI reads the folder, drawn rather than spelled: the label already says
// the name, and at 15px a mark survives a collapsed trigger the label cannot.
export function agentMark(cli: string, shared: boolean): MarkKind {
  if (cli === "claude") return "claude";
  return shared ? "shared" : "codex";
}

function Mark({ kind }: { kind: MarkKind }) {
  return (
    <svg viewBox="0 0 8 8" className="h-2 w-2" aria-hidden="true">
      {kind === "claude" && (
        <g stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
          <path d="M4 1v6M1.4 2.5l5.2 3M1.4 5.5l5.2-3" />
        </g>
      )}
      {kind === "codex" && <path d="M4 .9 7.1 4 4 7.1.9 4Z" fill="currentColor" />}
      {kind === "shared" && (
        <g fill="currentColor">
          <circle cx="1.3" cy="4" r="1" />
          <circle cx="4" cy="4" r="1" />
          <circle cx="6.7" cy="4" r="1" />
        </g>
      )}
      {kind === "prompt" && (
        <path
          d="M2 1.6 5.2 4 2 6.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

// The brand tint belongs to the folder list, where it is the answer. Repeated
// under "Who runs it" the same mark only has to point back, so it goes quiet.
export function Plate({ kind, quiet }: { kind: MarkKind; quiet?: boolean }) {
  return (
    <span
      data-mark={kind}
      className={`${PLATE} ${kind === "claude" && !quiet ? PLATE_TONE.claude : PLATE_TONE.agents}`}
    >
      <Mark kind={kind} />
    </span>
  );
}

interface OptionCardProps {
  id: string;
  on: boolean;
  // Where the arrow keys are standing. Focus stays on the trigger while the
  // list is open, so the highlight has to be drawn rather than borrowed.
  active: boolean;
  tone: OptionTone;
  mark: ReactNode;
  title: string;
  note: string;
  mono?: boolean;
  disabled?: boolean;
  onPick: () => void;
}

export function OptionCard({
  id,
  on,
  active,
  tone,
  mark,
  title,
  note,
  mono,
  disabled,
  onPick,
}: OptionCardProps) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={on}
      tabIndex={-1}
      disabled={disabled}
      onClick={onPick}
      className={`${CARD} ${
        disabled
          ? "cursor-default"
          : on
            ? SELECTED
            : `hover:bg-[var(--tk-hover)] ${active ? "bg-[var(--tk-hover)]" : ""}`
      }`}
    >
      {mark}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span
          className={`truncate text-[11.5px] ${
            disabled
              ? "text-[var(--text-muted)]"
              : on
                ? TITLE_ON[tone]
                : "text-[var(--text-primary)]"
          }`}
        >
          {title}
        </span>
        <span className={noteClass(mono)}>{note}</span>
      </span>
    </button>
  );
}
