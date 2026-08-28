import type { KeyboardEvent, ReactNode } from "react";

export const LABEL = "text-[11.5px] text-[var(--text-muted)]";

export const GRID = "grid gap-1.5 @min-[360px]:grid-cols-2";

const CARD =
  "flex min-w-0 items-start gap-[7px] rounded-[var(--tk-radius-s)] px-2 py-1.5 text-left transition-[background-color,box-shadow] focus:outline-none focus-visible:outline-[1.5px] focus-visible:outline-offset-[1px] focus-visible:outline-[var(--accent-blue)]";

// Selection is a ring rather than a fill. A filled surface in this pane already
// means "this one is not loading", and the choice of folder is not news about a
// running thing — so the cards spend an edge on it and leave the fills alone.
const HAIRLINE = "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_10%,transparent)]";
const HAIRLINE_OFF =
  "shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text-primary)_5%,transparent)]";

const RING = {
  dest: "shadow-[inset_0_0_0_1.5px_var(--accent-blue)]",
  mode: "shadow-[inset_0_0_0_1.5px_var(--accent-green)]",
} as const;

const TITLE_ON = {
  dest: "text-[var(--accent-blue-text)]",
  mode: "text-[var(--accent-green-text)]",
} as const;

const PLATE = "mt-px grid h-[15px] w-[15px] shrink-0 place-items-center rounded-[5px]";

const PLATE_TONE = {
  claude:
    "bg-[color-mix(in_srgb,var(--accent-claude)_22%,transparent)] text-[var(--accent-claude-text)]",
  agents: "bg-[color-mix(in_srgb,var(--text-primary)_10%,transparent)] text-[var(--text-secondary)]",
} as const;

export type MarkKind = "claude" | "codex" | "shared" | "prompt";

// Which CLI reads the folder, drawn rather than spelled: the label already says
// the name, and at 15px a mark survives the two-column layout the label cannot.
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

// One tab stop per group with the arrows moving the choice — what the radio
// role promises a keyboard. Selection follows focus, as it does in native
// radios, wrapping at either end and never landing on a disabled card.
export function onRadioKey(e: KeyboardEvent<HTMLDivElement>) {
  const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
  if (!forward && e.key !== "ArrowLeft" && e.key !== "ArrowUp") return;
  const radios = Array.from(
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  ).filter((radio) => !radio.disabled);
  const current = radios.indexOf(e.target as HTMLButtonElement);
  if (current < 0) return;
  e.preventDefault();
  if (radios.length < 2) return;
  const next = radios[(current + (forward ? 1 : radios.length - 1)) % radios.length];
  next.focus();
  next.click();
}

interface OptionCardProps {
  on: boolean;
  tone: keyof typeof RING;
  mark: ReactNode;
  title: string;
  note: string;
  tabIndex: number;
  mono?: boolean;
  disabled?: boolean;
  onPick: () => void;
}

export function OptionCard({
  on,
  tone,
  mark,
  title,
  note,
  tabIndex,
  mono,
  disabled,
  onPick,
}: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      tabIndex={tabIndex}
      disabled={disabled}
      onClick={onPick}
      className={`${CARD} ${
        disabled
          ? `cursor-default ${HAIRLINE_OFF}`
          : on
            ? RING[tone]
            : `${HAIRLINE} hover:bg-[var(--tk-hover)]`
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
        <span
          className={`text-[10px] text-[var(--text-muted)] ${
            mono ? "truncate font-mono" : "leading-snug"
          }`}
        >
          {note}
        </span>
      </span>
    </button>
  );
}
