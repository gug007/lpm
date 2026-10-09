import { accountLabel, skipSentence } from "../claudePoolText";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { useAppStore } from "../store/app";
import { openClaudeAccountSettings } from "../store/claudeAccountPin";
import { pendingSuggestion, useClaudePoolStore, type PoolView } from "../store/claudePool";

const BOX = "mx-2 mb-2 flex flex-col gap-1.5 rounded-lg border bg-[var(--bg-primary)] px-2.5 py-2 text-[11.5px]";
const BTN =
  "rounded-md border border-[var(--border)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)]";

/** Sidebar notes from account switching: in ask mode, the question before new
 *  sessions move to another account; in any mode, why switching is paused. */
export function ClaudePoolBanner() {
  const pool = useClaudePoolStore((s) => s.pool);
  const dismissed = useClaudePoolStore((s) => s.dismissed);
  const accept = useClaudePoolStore((s) => s.accept);
  const dismiss = useClaudePoolStore((s) => s.dismiss);
  const projects = useAppStore((s) => s.projects);
  if (!pool?.active) return null;

  if (pool.paused) {
    return (
      <div className={`${BOX} border-[color-mix(in_srgb,var(--accent-red)_45%,var(--border))]`} role="status">
        <span className="font-semibold text-[var(--text-primary)]">Account switching is paused</span>
        <span className="text-[var(--text-secondary)]">
          {pool.paused === "hold"
            ? `${accountLabel(pool.held ?? "", pool)} was put on hold. New sessions stay where they are until you turn switching back on.`
            : "Usage readings are off, so lpm can't tell when an account is close to a limit."}
        </span>
        <span>
          <button type="button" className={BTN} onClick={openClaudeAccountSettings}>
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
        const from = view.current ?? "";
        const skipped = pick.skipped.find((s) => s.id === from);
        const where = view.project ? ` in ${displayNameForProjectName(view.project, projects)}` : "";
        const to = accountLabel(pick.id, pool);
        return (
          <div
            key={view.key}
            className={`${BOX} border-[color-mix(in_srgb,var(--accent-amber)_50%,var(--border))]`}
            role="status"
          >
            <span className="font-semibold text-[var(--text-primary)]">
              {skipped ? skipSentence(from, skipped.skip, pool) : `${to} is first in your list and has room`}
            </span>
            <span className="text-[var(--text-secondary)]">
              {pick.kind === "mostRoom" ? `Every account is close to a limit; ${to} has the most room. ` : ""}
              Start new Claude sessions{where} on {to}? Sessions already running stay where they are.
            </span>
            <span className="flex gap-1.5">
              <button
                type="button"
                className="rounded-md bg-[var(--text-primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
                onClick={() => void accept(view.key)}
              >
                Use {to}
              </button>
              <button type="button" className={BTN} onClick={() => dismiss(view.key)}>
                Not now
              </button>
            </span>
          </div>
        );
      })}
    </>
  );
}
