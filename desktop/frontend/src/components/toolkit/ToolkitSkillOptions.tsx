import { shortPath } from "../../toolkit";
import type { SkillDestination } from "../../toolkitSkill";

const LABEL = "text-[11.5px] text-[var(--text-muted)]";

const CARD =
  "flex min-w-0 flex-col gap-0.5 rounded-[var(--tk-radius-s)] px-2 py-1.5 text-left transition-colors";

const GRID = "grid gap-1.5 @min-[360px]:grid-cols-2";

const TONE = {
  dest: "bg-[color-mix(in_srgb,var(--accent-blue)_16%,transparent)]",
  mode: "bg-[color-mix(in_srgb,var(--accent-green)_16%,transparent)]",
} as const;

interface OptionCardProps {
  on: boolean;
  tone: keyof typeof TONE;
  title: string;
  note: string;
  mono?: boolean;
  disabled?: boolean;
  onPick: () => void;
}

function OptionCard({ on, tone, title, note, mono, disabled, onPick }: OptionCardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onPick}
      className={`${CARD} ${
        disabled
          ? "cursor-default bg-[var(--tk-panel)]"
          : on
            ? TONE[tone]
            : "bg-[var(--tk-panel)] hover:bg-[var(--tk-hover)]"
      }`}
    >
      <span
        className={`truncate text-[11.5px] ${
          disabled ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]"
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
  slash: string;
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
  slash,
}: ToolkitSkillOptionsProps) {
  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className={LABEL}>Folder</span>
        <div role="radiogroup" aria-label="Folder" className={GRID}>
          {destinations.map((dest) => (
            <OptionCard
              key={dest.path}
              on={dest.path === destPath}
              tone="dest"
              title={dest.label}
              note={
                dest.exists
                  ? shortPath(dest.path)
                  : `${shortPath(dest.path)} — will be created`
              }
              mono
              onPick={() => onDest(dest.path)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL}>Who runs it</span>
        <div role="radiogroup" aria-label="Who runs it" className={GRID}>
          <OptionCard
            on={!manual}
            tone="mode"
            title="Your agent, when it fits"
            note="Picked up on its own whenever the description matches the task."
            onPick={() => onManual(false)}
          />
          {/* Only Claude honours the opt-out key, so under a Codex folder the
              card stays and explains itself rather than vanishing. */}
          <OptionCard
            on={manual}
            tone="mode"
            disabled={!manualAllowed}
            title="Only you"
            note={
              manualAllowed
                ? `Runs when you type ${slash} — agents never trigger it, and it costs no context.`
                : "Only Claude Code skills can be kept from the agent."
            }
            onPick={() => onManual(true)}
          />
        </div>
      </div>
    </div>
  );
}
