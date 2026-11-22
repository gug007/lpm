import { useEffect, useRef, type RefObject } from "react";
import type { TerminalViewHandle } from "../../components/TerminalView";
import { useAppStore } from "../../store/app";

// A phone, a paired Mac or the sidebar closes / renames / pins / reorders /
// forks / moves one of this view's tabs, addressed by id. Applied where the tabs
// are, on screen or not, so the person at this Mac keeps their view. The nonce
// latch keeps StrictMode from running one twice.
export function useRemoteTerminalOps(projectName: string, terminalRef: RefObject<TerminalViewHandle | null>): void {
  const pending = useAppStore((s) => s.pendingRemoteTerminalOp);
  const clear = useAppStore((s) => s.clearPendingRemoteTerminalOp);
  const consumed = useRef(0);
  useEffect(() => {
    if (!pending || pending.projectName !== projectName || consumed.current === pending.nonce) return;
    consumed.current = pending.nonce;
    const { op, id, label, emoji, order, account } = pending;
    clear();
    const view = terminalRef.current;
    if (op === "close") view?.remoteCloseTerminal(id);
    else if (op === "rename") view?.remoteRenameTerminal(id, label, emoji);
    else if (op === "title") view?.remoteRestoreTitle(id);
    else if (op === "pin") view?.remoteTogglePin(id);
    else if (op === "reorder") view?.remoteReorderTerminals(order);
    else if (op === "restart") view?.remoteRestartTerminal(id);
    else if (op === "fork") view?.remoteForkTerminal(id);
    else if (op === "forkCopy") view?.remoteForkIntoCopy(id);
    else if (op === "closeOthers") view?.remoteCloseOthers(id);
    else if (op === "copyAnswer") view?.copyLastAnswer(id);
    else if (op === "account" && account) view?.remoteSwitchClaudeAccount(id, account);
    else if (op === "move" && label) void view?.moveTerminalOut(id, label);
  }, [pending, projectName, clear]);
}
