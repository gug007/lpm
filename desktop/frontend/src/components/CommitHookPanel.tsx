import { hookHeadline, retryLabel, type HookFailure } from "../commitHook";
import type { LaunchpadOption } from "../launchpadAgentActions";
import { CommitHookOutput } from "./CommitHookOutput";
import { AlertCircleIcon, XIcon } from "./icons";
import { LaunchpadMark } from "./LaunchpadMark";

interface CommitHookPanelProps {
  failure: HookFailure;
  busy: boolean;
  /** The agent Fix with … starts; none hides the button. */
  fix: LaunchpadOption | null;
  onFix: () => void;
  onRetry: () => void;
  onSkipHooks: () => void;
  onDismiss: () => void;
}

const BUTTON =
  "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40";

/** Why the commit didn't happen when a git hook stopped it, with the ways on:
 *  an agent fixes what it found, try again, or commit without the hooks. */
export function CommitHookPanel({
  failure,
  busy,
  fix,
  onFix,
  onRetry,
  onSkipHooks,
  onDismiss,
}: CommitHookPanelProps) {
  const changed = failure.changed.length;
  return (
    <div
      role="alert"
      className="flex flex-col gap-2 rounded-lg border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/[0.06] p-3"
    >
      <div>
        <div className="flex items-center gap-2 text-[12.5px] font-medium text-[var(--text-primary)]">
          <span className="flex shrink-0 text-[var(--accent-red)] [&>svg]:h-3.5 [&>svg]:w-3.5">
            <AlertCircleIcon />
          </span>
          {hookHeadline(failure)}
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Back to the commit"
            className="ml-auto rounded p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
          >
            <XIcon />
          </button>
        </div>
        {failure.summary && (
          <p className="ml-[22px] mt-0.5 text-[12px] text-[var(--text-secondary)]">{failure.summary}</p>
        )}
      </div>
      <CommitHookOutput output={failure.output} />
      {changed > 0 && (
        <p className="text-[11.5px] text-[var(--text-muted)]">
          It rewrote{" "}
          <span className="font-mono text-[var(--text-secondary)]">
            {changed === 1 ? failure.changed[0] : `${changed} files`}
          </span>{" "}
          and left {changed === 1 ? "the change" : "the changes"} out of the commit.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {fix && (
          <button type="button" disabled={busy} onClick={onFix} className={BUTTON}>
            <LaunchpadMark agent={fix.agent} emoji={fix.emoji} size={12} />
            Fix with {fix.label}
          </button>
        )}
        <button type="button" disabled={busy} onClick={onRetry} className={BUTTON}>
          {retryLabel(failure)}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onSkipHooks}
          title="Commit with --no-verify: the hooks don't run"
          className="ml-auto rounded-md px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          Commit without hooks
        </button>
      </div>
    </div>
  );
}
