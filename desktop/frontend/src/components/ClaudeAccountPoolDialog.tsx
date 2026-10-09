import { useEffect, useState } from "react";
import { accountLabel } from "../claudePoolText";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { accountMeters } from "../sidebarUsage";
import { useAccountsStore } from "../store/accounts";
import { useAppStore } from "../store/app";
import { openClaudeAccountSettings, setClaudeAccountChoice } from "../store/claudeAccountPin";
import { poolForProject, unconfirmedAccounts, useClaudePoolStore } from "../store/claudePool";
import { AccountMeters } from "./AccountMeters";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { Modal } from "./ui/Modal";

const MAIN_LOGIN = "default";

const ARROW =
  "flex h-4 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-30";

/** "Choose accounts…" for one project: an ordered list its new Claude
 *  sessions take turns on. The project never uses accounts outside it. */
export function ClaudeAccountPoolDialog() {
  const project = useClaudePoolStore((s) => s.listDialogFor);
  const close = useClaudePoolStore((s) => s.closeListDialog);
  const askConsent = useClaudePoolStore((s) => s.askConsent);
  const consentOpen = useClaudePoolStore((s) => s.consentFor !== null);
  const pool = useClaudePoolStore((s) => s.pool);
  const accounts = useAccountsStore((s) => s.accounts);
  const projects = useAppStore((s) => s.projects);
  const { limits } = useAgentLimits();
  const now = useNow(true, 60000);
  const [ticked, setTicked] = useState<string[]>([]);

  const info = projects.find((p) => p.name === project);
  useEffect(() => {
    if (project) setTicked(info?.claudeAccount === undefined ? info?.claudeAccounts ?? [] : []);
    // Seed once per opening; later project updates must not clobber edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  if (!project || !pool) return null;

  const max = pool.maxMembers;
  const ids = [MAIN_LOGIN, ...accounts.map((a) => a.id)];
  const rows = [...ticked, ...ids.filter((id) => !ticked.includes(id))];
  const accountOf = (id: string) => pool.accounts.find((a) => a.id === id);
  const usable = (id: string) => {
    const a = accountOf(id);
    if (!a?.signedIn) return "Sign in first";
    if (a.plan !== "max" && a.plan !== "pro" && !pool.allowed.includes(id)) {
      return "Allow it under Settings → Claude accounts first";
    }
    return null;
  };
  const toggle = (id: string, on: boolean) =>
    setTicked((t) => (on ? (t.length < max ? [...t, id] : t) : t.filter((x) => x !== id)));
  const move = (i: number, d: -1 | 1) =>
    setTicked((t) => {
      const next = [...t];
      [next[i], next[i + d]] = [next[i + d], next[i]];
      return next;
    });
  const name = displayNameForProjectName(project, projects);
  const current = poolForProject(pool, project)?.current;

  // Every account that may take turns is confirmed as the user's own first,
  // whether or not switching is on yet.
  const save = async () => {
    const ids = ticked;
    const write = async () => {
      if (await setClaudeAccountChoice(project, { kind: "list", ids })) close();
    };
    const unconfirmed = unconfirmedAccounts(pool, ids);
    if (unconfirmed.length > 0) {
      askConsent({ patch: {}, members: unconfirmed, onDone: write });
      return;
    }
    await write();
  };

  return (
    <Modal
      open
      onClose={close}
      closeOnEscape={!consentOpen}
      zIndexClassName="z-[55]"
      contentClassName="w-[480px] max-w-[92vw] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <h3 className="mb-1 text-[15px] font-semibold text-[var(--text-primary)]">Claude accounts for {name}</h3>
      <p className="mb-3 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">
        New sessions start on the first ticked account that is under 90% of its 5-hour and weekly limits. This
        project only uses the accounts ticked here, up to {max}.
      </p>
      <div className="mb-3 divide-y divide-[var(--border)] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
        {rows.map((id) => {
          const on = ticked.includes(id);
          const i = ticked.indexOf(id);
          const blocked = usable(id);
          const account = accountOf(id);
          return (
            <div key={id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
              <input
                type="checkbox"
                aria-label={`Use ${accountLabel(id, pool)}`}
                checked={on}
                disabled={(!on && (!!blocked || ticked.length >= max))}
                onChange={(e) => toggle(id, e.target.checked)}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[var(--text-primary)]">{accountLabel(id, pool)}</span>
                  {account?.planLabel && (
                    <span className="shrink-0 rounded border border-[var(--border)] px-1 text-[9px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                      {account.planLabel}
                    </span>
                  )}
                  {on && current === id && (
                    <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent-claude)_16%,transparent)] px-1.5 text-[10px] text-[var(--accent-claude-text)]">
                      New sessions
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] text-[var(--text-muted)]">
                  {blocked ?? account?.email}
                </span>
              </span>
              {on && (
                <span className="flex w-36 shrink-0 flex-col gap-0.5">
                  <AccountMeters meters={accountMeters(limits, id, now)} />
                </span>
              )}
              {on ? (
                <span className="flex shrink-0 flex-col">
                  <button type="button" className={ARROW} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className={ARROW}
                    disabled={i === ticked.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move down"
                  >
                    <ChevronDownIcon />
                  </button>
                </span>
              ) : (
                <span className="w-5 shrink-0" />
              )}
            </div>
          );
        })}
      </div>
      {!pool.enabled && (
        <p className="text-[11.5px] text-[var(--text-muted)]">
          Switching is off, so new sessions use the first ticked account.{" "}
          <button
            type="button"
            className="text-[var(--text-secondary)] underline-offset-2 hover:underline"
            onClick={() => {
              close();
              openClaudeAccountSettings();
            }}
          >
            Turn it on in Settings
          </button>
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
          disabled={ticked.length === 0}
          onClick={() => void save()}
          className="rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </Modal>
  );
}
