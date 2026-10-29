import { useEffect, useState, type ReactNode } from "react";
import { toast } from "../notifications/toast";
import { MAIN_LOGIN, accountLabel } from "../claudePoolText";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { rowProps } from "../settings-registry";
import { accountMeters } from "../sidebarUsage";
import type { ClaudeAccount } from "../types";
import { ClaudeAccountListRow } from "./ClaudeAccountListRow";
import { ClaudeAccountMenu } from "./ClaudeAccountMenu";
import { ClaudeAccountsSetupGuide } from "./ClaudeAccountsSetupGuide";
import { ClaudeAddAccountModal } from "./ClaudeAddAccountModal";
import { ClaudeLoginModal } from "./ClaudeLoginModal";
import { ClaudeSwitchingControls } from "./ClaudeSwitchingControls";
import { ClaudeTurnOrder, type ClaudeAccountSummary } from "./ClaudeTurnOrder";
import { PlusIcon } from "./icons";
import { SettingsRow } from "./SettingsRow";
import { SettingsSection } from "./SettingsSection";
import { BTN_SECONDARY } from "./ui/buttons";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { useRowReach } from "./settings/settingsTarget";
import type { ClaudeAccountsSource } from "./settings/useClaudeAccountsSource";

const BTN_SIGN_IN =
  "rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85";

/** Settings › Accounts & usage › Claude: every account lpm knows on the machine
 *  Settings shows, adding, renaming or removing them, and whether and in what
 *  order new sessions take turns across them. */
export function ClaudeAccountsSection({ source }: { source: ClaudeAccountsSource }) {
  const shows = useRowReach();
  const { accounts, statuses, usage, pool } = source;
  const { limits } = useAgentLimits(source.host);
  const now = useNow(true, 60000);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClaudeAccount | null>(null);
  const [loginAccount, setLoginAccount] = useState<ClaudeAccount | null>(null);

  const { refresh } = source;
  useEffect(() => {
    void refresh();
  }, [refresh, accounts]);

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

  const switching = pool && (accounts.length > 0 || pool.enabled) ? pool : null;
  const logins = [MAIN_LOGIN, ...accounts.map((a) => a.id)];

  const poolAccount = (id: string) => pool?.accounts.find((a) => a.id === id);
  const extraAccount = (id: string) => accounts.find((a) => a.id === id);
  const signedInOf = (id: string) => poolAccount(id)?.signedIn ?? statuses[id]?.signedIn ?? false;

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

  const summary = (id: string): ClaudeAccountSummary => ({
    label: accountLabel(id, pool, accounts),
    signedIn: signedInOf(id),
    planLabel: poolAccount(id)?.planLabel,
    detail: detailFor(id),
  });

  const accountProps = (id: string) => {
    const extra = extraAccount(id);
    const signedIn = signedInOf(id);
    return {
      ...summary(id),
      meters: signedIn ? accountMeters(limits, id, now) : [],
      rename:
        extra && renaming === id
          ? {
              onCommit: (label: string) => {
                setRenaming(null);
                source.rename(id, label).catch((err) => toast.error(`Failed to rename account: ${err}`));
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

  return (
    <>
      <SettingsSection title="Claude">
        <ClaudeAccountsSetupGuide accounts={accounts} statuses={statuses} usage={usage} pool={pool} />
        <SettingsRow {...rowProps("ai.accounts")}>{null}</SettingsRow>
        <div>
          {logins.map((id) => (
            <ClaudeAccountListRow key={id} {...accountProps(id)} chips={[]} actions={signInButton(id)} />
          ))}
        </div>
        <SettingsRow label="Add account" description="Name it, then sign in to Claude">
          <button onClick={() => setAdding(true)} className={`${BTN_SECONDARY} flex items-center gap-1.5`}>
            <PlusIcon />
            Add…
          </button>
        </SettingsRow>
        {switching && shows("ai.accountSwitching") && (
          <>
            <ClaudeSwitchingControls pool={switching} source={source} busy={busy} run={run} />
            <ClaudeTurnOrder
              pool={switching}
              source={source}
              busy={busy}
              run={run}
              account={summary}
              signInButton={signInButton}
            />
          </>
        )}
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
            source
              .remove(confirmDelete.id)
              .then(refresh)
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
              const account = await source.add(label);
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
          startLogin={source.startLogin}
          status={{
            signedIn: signedInOf(loginAccount.id),
            email: poolAccount(loginAccount.id)?.email || statuses[loginAccount.id]?.email || "",
            planLabel: poolAccount(loginAccount.id)?.planLabel ?? "",
          }}
          refresh={refresh}
          onClose={() => setLoginAccount(null)}
        />
      )}
    </>
  );
}
