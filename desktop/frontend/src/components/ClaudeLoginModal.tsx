import { useEffect, useRef, useState } from "react";
import { toast } from "../notifications/toast";
import { Modal } from "./ui/Modal";
import { InteractivePane } from "./InteractivePane";
import { ClaudeLoginStatusStrip } from "./ClaudeLoginStatusStrip";
import { BTN_SECONDARY } from "./ui/buttons";
import { StopTerminal } from "../../bridge/commands";
import type { ClaudeLoginStatus } from "../claudeLoginStatus";
import type { ClaudeAccount } from "../types";

const POLL_MS = 2000;

const BTN_PRIMARY =
  "rounded-md bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85";

interface ClaudeLoginModalProps {
  account: ClaudeAccount;
  // Starts the login terminal on the account's machine; a paired machine's is
  // attached here.
  startLogin: (id: string) => Promise<string>;
  // The account's sign-in as the accounts list last read it.
  status: ClaudeLoginStatus;
  // Reads the accounts again: while waiting, once signed in, and once the
  // terminal is gone.
  refresh: () => Promise<void>;
  onClose: () => void;
}

// Hosts a live login terminal running `claude /login` under the account's
// isolated config dir. Mounted only while signing in (parent renders it
// conditionally), so the PTY's lifetime is the mount's: started on mount, killed
// on unmount, with statuses refreshed afterwards to reflect a completed login.
export function ClaudeLoginModal({ account, startLogin, status, refresh, onClose }: ClaudeLoginModalProps) {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const idRef = useRef<string | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const signedIn = status.signedIn;

  useEffect(() => {
    let cancelled = false;
    startLogin(account.id)
      .then((id) => {
        if (cancelled) {
          StopTerminal(id).catch(() => {});
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
        StopTerminal(idRef.current).catch(() => {});
        idRef.current = null;
      }
      void refreshRef.current();
    };
    // account.id is stable for the mount; the callbacks are read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  useEffect(() => {
    if (signedIn) {
      void refreshRef.current();
      return;
    }
    const timer = window.setInterval(() => void refreshRef.current(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [signedIn]);

  return (
    <Modal
      open
      onClose={onClose}
      closeOnBackdrop={signedIn}
      closeOnEscape={signedIn}
      zIndexClassName="z-[60]"
      contentClassName="flex h-[560px] w-[820px] max-w-[92vw] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-xl"
    >
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">
            Sign in — {account.label}
          </h3>
          <p className="text-[11px] text-[var(--text-muted)]">
            Finish in your browser. If it asks for a code, paste it below.
          </p>
        </div>
        <button onClick={onClose} className={signedIn ? BTN_PRIMARY : BTN_SECONDARY}>
          {signedIn ? "Done" : "Cancel"}
        </button>
      </div>
      <ClaudeLoginStatusStrip status={status} />
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
