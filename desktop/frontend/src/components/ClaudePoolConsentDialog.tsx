import { useEffect, useState } from "react";
import { accountLabel } from "../claudePoolText";
import { isPeerName } from "../peer/markers";
import { useAppStore } from "../store/app";
import { useClaudePoolStore } from "../store/claudePool";
import type { ProjectInfo } from "../types";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { Modal } from "./ui/Modal";

const SHOWN_PROJECTS = 6;

function followsMainAccounts(p: ProjectInfo, projects: ProjectInfo[]): boolean {
  if (p.isRemote || isPeerName(p.name)) return false;
  const own = p.claudeAccount !== undefined || p.claudeAccounts !== undefined;
  if (own) return p.claudeAccount === undefined && (p.claudeAccounts?.length ?? 0) === 0;
  const parent = p.parentName ? projects.find((q) => q.name === p.parentName) : undefined;
  return !parent || (parent.claudeAccount === undefined && (parent.claudeAccounts?.length ?? 0) === 0);
}

/** Asked before switching is turned on and whenever an account joins the
 *  list: every account must be the user's own. */
export function ClaudePoolConsentDialog() {
  const request = useClaudePoolStore((s) => s.consentFor);
  const pool = useClaudePoolStore((s) => s.pool);
  const close = useClaudePoolStore((s) => s.closeConsent);
  const update = useClaudePoolStore((s) => s.update);
  const projects = useAppStore((s) => s.projects);
  const [mine, setMine] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => setMine({}), [request]);

  if (!request || !pool) return null;

  const { patch } = request;
  const turningOn = patch.enabled === true;
  // Turning switching on also starts every project's own list, so those
  // accounts are confirmed too.
  const asked = request.members ?? patch.main ?? pool.main;
  const listed = turningOn ? pool.pools.flatMap((p) => p.members) : [];
  const members = [...new Set([...asked, ...listed])].filter(
    (id) => pool.accounts.find((a) => a.id === id)?.signedIn,
  );
  const affected = turningOn ? projects.filter((p) => followsMainAccounts(p, projects)) : [];
  const allMine = members.length > 0 && members.every((id) => mine[id]);

  const confirm = async () => {
    setBusy(true);
    try {
      await update({ ...patch, consent: true, confirm: members });
      close();
      await request.onDone?.();
    } catch {
      // The store already reported it.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      zIndexClassName="z-[60]"
      contentClassName="w-[460px] max-w-[92vw] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <h3 className="mb-2 text-[15px] font-semibold text-[var(--text-primary)]">
        {turningOn ? "Switch between your Claude accounts?" : "Add this account to the list?"}
      </h3>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
        New Claude sessions start on the first account in your list and move to the next one only when an
        account is close to its 5-hour or weekly limit. Sessions already running stay on their account.
      </p>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
        Every account must be yours alone. Anthropic hasn&rsquo;t said whether switching accounts when one
        runs low is allowed, and it can limit or close accounts it believes break its terms. Usage credits or
        a higher plan are Anthropic&rsquo;s supported ways to keep working past a limit.
      </p>
      <div className="mb-3 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
        {members.map((id) => {
          const account = pool.accounts.find((a) => a.id === id);
          const personal = account?.plan === "max" || account?.plan === "pro";
          return (
            <label key={id} className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[var(--text-primary)]">
                  {accountLabel(id, pool)}
                  {account?.planLabel && (
                    <span className="ml-1.5 rounded border border-[var(--border)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {account.planLabel}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">{account?.email}</span>
                {!personal && (
                  <span className="block text-[11px] text-[var(--accent-amber-text)]">
                    Not a personal plan. Its use counts against, and can be billed to, its organization.
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={!!mine[id]}
                  onChange={(e) => setMine((m) => ({ ...m, [id]: e.target.checked }))}
                />
                Only mine
              </span>
            </label>
          );
        })}
      </div>
      {affected.length > 0 && (
        <p className="text-[11.5px] text-[var(--text-muted)]">
          Projects that start switching, because they don&rsquo;t have an account of their own:{" "}
          {affected
            .slice(0, SHOWN_PROJECTS)
            .map((p) => displayNameForProjectName(p.name, projects))
            .join(", ")}
          {affected.length > SHOWN_PROJECTS ? ` and ${affected.length - SHOWN_PROJECTS} more` : ""}.
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={close}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)]"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!allMine || busy}
          onClick={() => void confirm()}
          className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          {turningOn ? "Turn on" : "Add"}
        </button>
      </div>
    </Modal>
  );
}
