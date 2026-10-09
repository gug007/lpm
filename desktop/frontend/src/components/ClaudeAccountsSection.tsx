import { useState } from "react";
import { toast } from "sonner";
import { useAccountsStore } from "../store/accounts";
import { useClaudePoolStore } from "../store/claudePool";
import type { ClaudeAccount } from "../types";
import { ClaudeAccountRow } from "./ClaudeAccountRow";
import { ClaudeAccountsSetupGuide } from "./ClaudeAccountsSetupGuide";
import { ClaudeLoginModal } from "./ClaudeLoginModal";
import { PlusIcon } from "./icons";
import { InlineNameEditor } from "./InlineNameEditor";
import { SettingsSection } from "./SettingsSection";
import { BTN_SECONDARY } from "./ui/buttons";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface ClaudeAccountsSectionProps {
  collapsed: boolean;
  onToggle: () => void;
}

/** Settings → the Claude accounts lpm knows: add, rename, sign in, remove. */
export function ClaudeAccountsSection({ collapsed, onToggle }: ClaudeAccountsSectionProps) {
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const usage = useAccountsStore((s) => s.usage);
  const addAccount = useAccountsStore((s) => s.add);
  const renameAccount = useAccountsStore((s) => s.rename);
  const removeAccount = useAccountsStore((s) => s.remove);
  const refreshPool = useClaudePoolStore((s) => s.hydrate);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ClaudeAccount | null>(null);
  const [loginAccount, setLoginAccount] = useState<ClaudeAccount | null>(null);

  return (
    <>
      <SettingsSection
        id="ai.accounts"
        title="Multiple Claude accounts"
        description="Keep each project signed in to the right Claude account."
        collapsible
        collapsed={collapsed}
        onToggle={onToggle}
        summary={
          accounts.length > 0
            ? `${accounts.length} account${accounts.length === 1 ? "" : "s"}`
            : "Set up"
        }
      >
        <ClaudeAccountsSetupGuide accounts={accounts} statuses={statuses} usage={usage} />
        {accounts.map((acc) => (
          <ClaudeAccountRow
            key={acc.id}
            id={acc.id}
            label={acc.label}
            status={statuses[acc.id]}
            usage={usage[acc.id] ?? []}
            onRename={(label) =>
              renameAccount(acc.id, label).catch((err) =>
                toast.error(`Failed to rename account: ${err}`),
              )
            }
            onSignIn={() => setLoginAccount(acc)}
            onDelete={() => setConfirmDelete(acc)}
          />
        ))}
        {adding ? (
          <div className="flex items-center gap-3 bg-[var(--bg-secondary)]/30 px-4 py-3 text-sm">
            <InlineNameEditor
              initial=""
              placeholder="e.g. Work"
              commitTitle="Add (Esc to cancel)"
              onCommit={(label) => {
                setAdding(false);
                addAccount(label).catch((err) => toast.error(`Failed to add account: ${err}`));
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <div className="flex items-center justify-end bg-[var(--bg-secondary)]/30 px-4 py-3">
            <button
              onClick={() => setAdding(true)}
              className={`${BTN_SECONDARY} flex items-center gap-1.5`}
            >
              <PlusIcon />
              Add account
            </button>
          </div>
        )}
      </SettingsSection>
      {!collapsed && (
        <div className="mt-3 flex items-start gap-2 px-1 text-[10px] leading-relaxed text-[var(--text-muted)]">
          <span className="mt-px shrink-0 rounded border border-[var(--border)] px-1.5 py-px font-medium uppercase tracking-wide">
            Note
          </span>
          <p>
            Remove a manually set <code className="text-[var(--text-secondary)]">CLAUDE_CONFIG_DIR</code> from
            your shell profile. Login shells re-source it and override project accounts.
          </p>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Remove account"
        variant="destructive"
        confirmLabel="Remove"
        body={
          <>
            Remove{" "}
            <span className="font-medium text-[var(--text-primary)]">{confirmDelete?.label}</span>
            ? It will be signed out and its sign-in data deleted.{" "}
            {confirmDelete && (usage[confirmDelete.id]?.length ?? 0) > 0 ? (
              <>
                Used by{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {usage[confirmDelete.id].join(", ")}
                </span>
                {" "}— they will use your other accounts instead.
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
              .then(() => refreshPool())
              .catch((err) => toast.error(`Failed to remove account: ${err}`));
          }
          setConfirmDelete(null);
        }}
      />

      {loginAccount && (
        <ClaudeLoginModal
          account={loginAccount}
          onClose={() => {
            setLoginAccount(null);
            void refreshPool();
          }}
        />
      )}
    </>
  );
}
