import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { MAIN_LOGIN, accountLabel, skipChip } from "../claudePoolText";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { accountMeters } from "../sidebarUsage";
import { useAccountsStore } from "../store/accounts";
import {
  MAIN_POOL,
  pendingSuggestion,
  poolForProjectKey,
  useClaudePoolStore,
  type ClaudePool,
} from "../store/claudePool";
import type { ClaudeAccount } from "../types";
import { ClaudeAccountListRow, type AccountChip } from "./ClaudeAccountListRow";
import { ClaudeAccountMenu } from "./ClaudeAccountMenu";
import { ClaudeAccountsSetupGuide } from "./ClaudeAccountsSetupGuide";
import { ClaudeAddAccountModal } from "./ClaudeAddAccountModal";
import { ClaudeLoginModal } from "./ClaudeLoginModal";
import { ClaudeSortableAccountRow } from "./ClaudeSortableAccountRow";
import { ClaudeSwitchingControls } from "./ClaudeSwitchingControls";
import { PlusIcon } from "./icons";
import { SettingsSection } from "./SettingsSection";
import { BTN_SECONDARY } from "./ui/buttons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { SortableList } from "./ui/SortableList";
import { Toggle } from "./ui/Toggle";

const ORG_NOTE =
  "Not a personal Pro or Max plan. Its use counts against, and can be billed to, the organization that owns it.";
const HEADING = "px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]";
const BTN_SIGN_IN =
  "rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85";

function chipsFor(id: string, pool: ClaudePool, dismissed: Record<string, string>): AccountChip[] {
  if (!pool.active) return [];
  const view = poolForProjectKey(pool, MAIN_POOL);
  if (!view) return [];
  const chips: AccountChip[] = [];
  if (view.current === id) chips.push({ text: "New sessions", tone: "claude" });
  else if (pendingSuggestion(pool, view, dismissed)?.id === id) chips.push({ text: "Suggested", tone: "muted" });
  const skip = view.pick?.skipped.find((s) => s.id === id)?.skip;
  if (skip && skip.kind !== "signedOut") chips.push(skipChip(skip));
  return chips;
}

/** Settings → Claude accounts: every account lpm knows, which of them take
 *  turns for new sessions and in what order, and adding, renaming or removing
 *  them. */
export function ClaudeAccountsSection() {
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const usage = useAccountsStore((s) => s.usage);
  const addAccount = useAccountsStore((s) => s.add);
  const renameAccount = useAccountsStore((s) => s.rename);
  const removeAccount = useAccountsStore((s) => s.remove);
  const pool = useClaudePoolStore((s) => s.pool);
  const dismissed = useClaudePoolStore((s) => s.dismissed);
  const hydratePool = useClaudePoolStore((s) => s.hydrate);
  const update = useClaudePoolStore((s) => s.update);
  const askConsent = useClaudePoolStore((s) => s.askConsent);
  const { limits } = useAgentLimits();
  const now = useNow(true, 60000);
  const [busy, setBusy] = useState(false);
  const [pendingMain, setPendingMain] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClaudeAccount | null>(null);
  const [loginAccount, setLoginAccount] = useState<ClaudeAccount | null>(null);

  useEffect(() => {
    void hydratePool();
  }, [hydratePool, accounts]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      // The store already reported it.
    } finally {
      setBusy(false);
    }
  };

  // The list shows the new order right away instead of snapping back while it saves.
  const setMain = (next: string[]) => {
    setPendingMain(next);
    void run(() => update({ main: next })).finally(() => setPendingMain(null));
  };

  const switching = pool && (accounts.length > 0 || pool.enabled) ? pool : null;
  const rotation = switching?.enabled ? switching : null;
  const main = rotation ? (pendingMain ?? rotation.main) : [];
  const others = [MAIN_LOGIN, ...accounts.map((a) => a.id)].filter((id) => !main.includes(id));

  const poolAccount = (id: string) => pool?.accounts.find((a) => a.id === id);
  const extraAccount = (id: string) => accounts.find((a) => a.id === id);
  const signedInOf = (id: string) => poolAccount(id)?.signedIn ?? statuses[id]?.signedIn ?? false;
  const notAllowed = (p: ClaudePool, id: string) => {
    const plan = poolAccount(id)?.plan;
    return plan !== undefined && plan !== "max" && plan !== "pro" && !p.allowed.includes(id);
  };

  const copyId = async (id: string) => {
    try {
      await navigator.clipboard.writeText(id);
      toast.success("Account id copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  const detailFor = (id: string): ReactNode => {
    if (!signedInOf(id)) return "Not signed in";
    if (rotation && notAllowed(rotation, id)) return ORG_NOTE;
    const email = poolAccount(id)?.email || statuses[id]?.email || "Signed in";
    const projects = usage[id] ?? [];
    if (projects.length === 0) return email;
    return (
      <>
        {email} ·{" "}
        <span title={`Used by ${projects.join(", ")}`}>
          {projects.length} project{projects.length === 1 ? "" : "s"}
        </span>
      </>
    );
  };

  const rowProps = (id: string) => {
    const extra = extraAccount(id);
    const signedIn = signedInOf(id);
    return {
      label: accountLabel(id, pool),
      signedIn,
      planLabel: poolAccount(id)?.planLabel,
      detail: detailFor(id),
      meters: signedIn ? accountMeters(limits, id, now) : [],
      rename:
        extra && renaming === id
          ? {
              onCommit: (label: string) => {
                setRenaming(null);
                renameAccount(id, label).catch((err) => toast.error(`Failed to rename account: ${err}`));
              },
              onCancel: () => setRenaming(null),
            }
          : undefined,
      menu: extra ? (
        <ClaudeAccountMenu
          label={extra.label}
          onRename={() => setRenaming(id)}
          onCopyId={() => void copyId(id)}
          onRemove={() => setConfirmDelete(extra)}
        />
      ) : undefined,
    };
  };

  const signInButton = (id: string) => {
    const account = extraAccount(id);
    if (!account || signedInOf(id)) return null;
    return (
      <button type="button" className={BTN_SIGN_IN} onClick={() => setLoginAccount(account)}>
        Sign in
      </button>
    );
  };

  const memberActions = (p: ClaudePool, id: string) => {
    const account = poolAccount(id);
    const last = main.length === 1;
    return (
      <>
        {signInButton(id)}
        {account?.signedIn && !account.confirmed && (
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy}
            onClick={() => askConsent({ patch: {}, members: [id] })}
          >
            Confirm
          </button>
        )}
        <span className="flex" title={last ? "At least one account takes turns" : undefined}>
          <Toggle
            enabled
            onChange={() => setMain(main.filter((m) => m !== id))}
            disabled={busy || last}
            aria-label={`${accountLabel(id, p)} takes turns`}
          />
        </span>
      </>
    );
  };

  const otherActions = (p: ClaudePool, id: string) => {
    if (!signedInOf(id)) return signInButton(id);
    const full = p.main.length >= p.maxMembers;
    const fullTitle = full ? `Up to ${p.maxMembers} accounts take turns` : undefined;
    if (notAllowed(p, id)) {
      return (
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy || full}
          title={fullTitle}
          onClick={() => askConsent({ patch: { allowed: [...p.allowed, id], main: [...p.main, id] } })}
        >
          Allow
        </button>
      );
    }
    return (
      <span className="flex" title={fullTitle}>
        <Toggle
          enabled={false}
          onChange={() => askConsent({ patch: { main: [...p.main, id] }, members: [id] })}
          disabled={busy || full}
          aria-label={`${accountLabel(id, p)} takes turns`}
        />
      </span>
    );
  };

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= main.length) return;
    const next = [...main];
    [next[i], next[j]] = [next[j], next[i]];
    setMain(next);
  };

  return (
    <>
      <SettingsSection
        id="ai.accounts"
        title="Claude accounts"
        description="Sign in once for each account. A project can stay on one account, or new sessions can take turns across the accounts in rotation."
      >
        <ClaudeAccountsSetupGuide accounts={accounts} statuses={statuses} usage={usage} />
        {switching && <ClaudeSwitchingControls pool={switching} busy={busy} run={run} />}
        {rotation && (
          <div>
            <div className={`${HEADING} flex items-baseline justify-between gap-4`}>
              <span>In rotation</span>
              {main.length > 1 && <span className="normal-case tracking-normal">Drag to reorder</span>}
            </div>
            <SortableList ids={main} onReorder={setMain}>
              {main.map((id, i) => (
                <ClaudeSortableAccountRow
                  key={id}
                  id={id}
                  {...rowProps(id)}
                  order={i + 1}
                  chips={chipsFor(id, rotation, dismissed)}
                  actions={memberActions(rotation, id)}
                  onMove={(delta) => move(i, delta)}
                  disabled={main.length < 2}
                />
              ))}
            </SortableList>
          </div>
        )}
        {others.length > 0 && (
          <div>
            {rotation && <div className={HEADING}>Not in rotation</div>}
            {others.map((id) => (
              <ClaudeAccountListRow
                key={id}
                {...rowProps(id)}
                chips={[]}
                indent={!!rotation}
                actions={rotation ? otherActions(rotation, id) : signInButton(id)}
              />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-[var(--bg-secondary)]/30 px-4 py-3">
          <button onClick={() => setAdding(true)} className={`${BTN_SECONDARY} flex items-center gap-1.5`}>
            <PlusIcon />
            Add account
          </button>
          {switching && (
            <span className="min-w-0 flex-1 text-right text-[11px] text-[var(--text-muted)]">
              Need more room on one account? Usage credits keep it going past its limit.
            </span>
          )}
        </div>
      </SettingsSection>
      <div className="mt-3 flex items-start gap-2 px-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
        <span className="mt-px shrink-0 rounded border border-[var(--border)] px-1.5 py-px font-medium uppercase tracking-wide">
          Note
        </span>
        <p>
          Remove a manually set <code className="text-[var(--text-secondary)]">CLAUDE_CONFIG_DIR</code> from your
          shell profile. Login shells re-source it and override project accounts.
        </p>
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove account"
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Remove <span className="font-medium text-[var(--text-primary)]">{confirmDelete?.label}</span>? It will be
            signed out and its sign-in data deleted.{" "}
            {confirmDelete && (usage[confirmDelete.id]?.length ?? 0) > 0 ? (
              <>
                Used by{" "}
                <span className="font-medium text-[var(--text-primary)]">{usage[confirmDelete.id].join(", ")}</span>{" "}
                — they will use your other accounts instead.
              </>
            ) : (
              <>Projects assigned to it will use your main Claude login instead.</>
            )}
          </>
        }
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            removeAccount(confirmDelete.id)
              .then(() => hydratePool())
              .catch((err) => toast.error(`Failed to remove account: ${err}`));
          }
          setConfirmDelete(null);
        }}
      />

      {adding && (
        <ClaudeAddAccountModal
          takenNames={["Main login", ...accounts.map((a) => a.label)]}
          onClose={() => setAdding(false)}
          onAdd={async (label) => {
            try {
              const account = await addAccount(label);
              setAdding(false);
              setLoginAccount(account);
            } catch (err) {
              toast.error(`Failed to add account: ${err}`);
            }
          }}
        />
      )}

      {loginAccount && (
        <ClaudeLoginModal
          account={loginAccount}
          onClose={() => {
            setLoginAccount(null);
            void hydratePool();
          }}
        />
      )}
    </>
  );
}
