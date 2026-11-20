import { accountLabel, skipSentence } from "../claudePoolText";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { useAppStore } from "../store/app";
import { pendingSuggestion, type ClaudePool, type PoolView } from "../store/claudePool";
import type { ClaudeAccount } from "../types";

const BOX = "mx-2 mb-2 flex flex-col gap-1.5 rounded-lg border bg-[var(--bg-primary)] px-2.5 py-2 text-[11.5px]";
const BTN =
  "rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)]";

interface Props {
  pool: ClaudePool;
  // Suggestions put off, by pool key.
  dismissed: Record<string, string>;
  // The machine these are from, by name; absent while this one is the only one.
  machine?: string;
  // That machine's accounts, which name its pool's members.
  accounts?: ClaudeAccount[];
  onAccept: (key: string) => void;
  onDismiss: (key: string) => void;
  onOpenSettings: () => void;
}

/** One machine's notes from account switching: in ask mode, the question before
 *  new sessions move to another account; in any mode, why switching is paused. */
export function ClaudePoolNotes({ pool, dismissed, machine, accounts, onAccept, onDismiss, onOpenSettings }: Props) {
  const projects = useAppStore((s) => s.projects);
  if (!pool.active) return null;
  const machineName = machine && (
    <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">{machine}</span>
  );

  if (pool.paused) {
    return (
      <div className={`${BOX} border-[color-mix(in_srgb,var(--accent-red)_45%,var(--border))]`} role="status">
        {machineName}
        <span className="font-semibold text-[var(--text-primary)]">Account switching is paused</span>
        <span className="text-[var(--text-secondary)]">
          {pool.paused === "hold"
            ? `${accountLabel(pool.held ?? "", pool, accounts)} was put on hold. New sessions stay where they are until you turn switching back on.`
            : "Usage readings are off, so lpm can't tell when an account is close to a limit."}
        </span>
        <span>
          <button type="button" className={BTN} onClick={onOpenSettings}>
            Open settings
          </button>
        </span>
      </div>
    );
  }

  const asks = pool.pools
    .map((view) => ({ view, pick: pendingSuggestion(pool, view, dismissed) }))
    .filter((a): a is { view: PoolView; pick: NonNullable<typeof a.pick> } => a.pick !== null);
  if (asks.length === 0) return null;

  return (
    <>
      {asks.map(({ view, pick }) => {
        const current = view.current ?? "";
        const skipped = pick.skipped.find((s) => s.id === current);
        const where = view.project ? ` in ${displayNameForProjectName(view.project, projects)}` : "";
        const to = accountLabel(pick.id, pool, accounts);
        return (
          <div
            key={view.key}
            className={`${BOX} border-[color-mix(in_srgb,var(--accent-amber)_50%,var(--border))]`}
            role="status"
          >
            {machineName}
            <span className="font-semibold text-[var(--text-primary)]">
              {skipped
                ? skipSentence(current, skipped.skip, pool, Date.now(), accounts)
                : `${to} is first in your list and has room`}
            </span>
            <span className="text-[var(--text-secondary)]">
              {pick.kind === "mostRoom" ? `Every account is close to a limit; ${to} has the most room. ` : ""}
              Start new Claude sessions{where} on {to}? Sessions already running stay where they are.
            </span>
            <span className="flex gap-1.5">
              <button
                type="button"
                className="rounded-md bg-[var(--text-primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
                onClick={() => onAccept(view.key)}
              >
                Use {to}
              </button>
              <button type="button" className={BTN} onClick={() => onDismiss(view.key)}>
                Not now
              </button>
            </span>
          </div>
        );
      })}
    </>
  );
}
