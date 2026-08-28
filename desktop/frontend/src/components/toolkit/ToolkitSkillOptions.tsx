import type { ReactNode } from "react";
import { shortPath } from "../../toolkit";
import { isSharedSkillsDir, type SkillDestination } from "../../toolkitSkill";

const LABEL = "text-[11.5px] text-[var(--text-muted)]";

const GRID = "grid gap-1.5 @min-[360px]:grid-cols-2";

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

type MarkKind = "claude" | "codex" | "shared" | "prompt";

// Which CLI reads the folder, drawn rather than spelled: the label already says
// the name, and at 15px a mark survives the two-column layout the label cannot.
function markKind(dest: SkillDestination | null): MarkKind {
  if (!dest) return "codex";
  if (dest.cli === "claude") return "claude";
  return isSharedSkillsDir(dest.path) ? "shared" : "codex";
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
function Plate({ kind, quiet }: { kind: MarkKind; quiet?: boolean }) {
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
  on: boolean;
  tone: keyof typeof RING;
  mark: ReactNode;
  title: string;
  note: string;
  mono?: boolean;
  disabled?: boolean;
  onPick: () => void;
}

function OptionCard({ on, tone, mark, title, note, mono, disabled, onPick }: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
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

interface ToolkitSkillOptionsProps {
  destinations: SkillDestination[];
  destPath: string;
  onDest: (path: string) => void;
  manual: boolean;
  manualAllowed: boolean;
  onManual: (manual: boolean) => void;
  invocation: string;
}

// The two choices a new skill needs after its name. Both are cards rather than
// a line of tokens: the folders differ only by the path they write to, so the
// path has to be readable while the choice is being made.
export function ToolkitSkillOptions({
  destinations,
  destPath,
  onDest,
  manual,
  manualAllowed,
  onManual,
  invocation,
}: ToolkitSkillOptionsProps) {
  const dest = destinations.find((d) => d.path === destPath) ?? null;
  // The shared folder is read by three CLIs and only Codex is holding back, so
  // saying "agents never trigger it" there would be a promise lpm cannot keep.
  const shared = dest?.cli === "codex" && isSharedSkillsDir(dest.path);
  const manualNote = !manualAllowed
    ? "Skills here always stay open to the agent."
    : shared
      ? `Runs when you type ${invocation} — only Codex holds it back. Gemini and OpenCode still pick it up on their own.`
      : `Runs when you type ${invocation} — agents never trigger it, and it costs no context.`;

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Folder</span>
        <div role="radiogroup" aria-label="Folder" className={GRID}>
          {destinations.map((option) => (
            <OptionCard
              key={option.path}
              on={option.path === destPath}
              tone="dest"
              mark={<Plate kind={markKind(option)} />}
              title={option.label}
              note={
                option.exists
                  ? shortPath(option.path)
                  : `${shortPath(option.path)} — will be created`
              }
              mono
              onPick={() => onDest(option.path)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Who runs it</span>
        <div role="radiogroup" aria-label="Who runs it" className={GRID}>
          {/* The marks carry the answer twice over: the agent that reads the
              chosen folder, against the prompt the user types at. */}
          <OptionCard
            on={!manual}
            tone="mode"
            mark={<Plate kind={markKind(dest)} quiet />}
            title="Your agent, when it fits"
            note="Picked up on its own whenever the description matches the task."
            onPick={() => onManual(false)}
          />
          <OptionCard
            on={manual}
            tone="mode"
            mark={<Plate kind="prompt" quiet />}
            disabled={!manualAllowed}
            title="Only you"
            note={manualNote}
            onPick={() => onManual(true)}
          />
        </div>
      </div>
    </div>
  );
}
