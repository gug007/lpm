import { useEffect, useRef, useState } from "react";
import { toast } from "../toast";
import { Modal } from "./ui/Modal";
import { InteractivePane } from "./InteractivePane";
import { StartClaudeLogin, StopTerminal } from "../../bridge/commands";
import { useAccountsStore } from "../store/accounts";
import type { ClaudeAccount } from "../types";

interface ClaudeLoginModalProps {
  account: ClaudeAccount;
  onClose: () => void;
}

// Hosts a live login terminal running `claude /login` under the account's
// isolated config dir. Mounted only while signing in (parent renders it
// conditionally), so the PTY's lifetime is the mount's: started on mount, killed
// on unmount, with statuses refreshed afterwards to reflect a completed login.
export function ClaudeLoginModal({ account, onClose }: ClaudeLoginModalProps) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const refreshStatuses = useAccountsStore((s) => s.refreshStatuses);

  useEffect(() => {
    let cancelled = false;
    StartClaudeLogin(account.id)
      .then((id) => {
        if (cancelled) {
          void StopTerminal(id);
          return;
        }
        idRef.current = id;
        setTerminalId(id);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(`Failed to start sign-in: ${err}`);
          onClose();
        }
      });
    return () => {
      cancelled = true;
      if (idRef.current) {
        void StopTerminal(idRef.current);
        idRef.current = null;
      }
      void refreshStatuses();
    };
    // account.id is stable for the mount; onClose/refreshStatuses are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  return (
    <Modal
      open
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="flex h-[560px] w-[820px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            Sign in — {account.label}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)]">
            Follow the prompts to authenticate. Close this window when done.
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
        >
          Done
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col bg-[var(--terminal-bg)]">
        {terminalId ? (
          <InteractivePane terminalId={terminalId} visible />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-[var(--text-muted)]">
            Starting sign-in…
          </div>
        )}
      </div>
    </Modal>
  );
}
