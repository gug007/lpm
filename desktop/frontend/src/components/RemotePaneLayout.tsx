import { useEffect, useState, type ReactNode } from "react";
import { IconBtn } from "./terminal/IconBtn";
import { SplitRightIcon, SplitDownIcon } from "./terminal/icons";
import { XIcon } from "./icons";
import { RemoteTerminalMirror } from "./RemoteTerminalMirror";
import type { RemoteTerminal } from "../store/peers";
import {
  leaf,
  leaves,
  splitLeaf,
  closeLeaf,
  setLeafTerminal,
  pruneToTerminals,
  type RemotePaneNode,
} from "../remotePaneLayout";

// Split/stack panes hosting remote terminal mirrors — the local strip's split
// capability (row/col + close), no drag-rearrange (deferred). Entering pane mode
// starts pre-split into two panes; closing back to one is done via each pane's ×.
export function RemotePaneLayout({
  peerId,
  terminals,
  initialTerminalId,
}: {
  peerId: string;
  terminals: RemoteTerminal[];
  initialTerminalId: string | null;
}) {
  const [tree, setTree] = useState<RemotePaneNode>(() => {
    const firstId = initialTerminalId ?? terminals[0]?.id ?? null;
    const secondId = terminals.find((t) => t.id !== firstId)?.id ?? terminals[0]?.id ?? null;
    const first = leaf(firstId);
    return splitLeaf(first, first.id, "row", secondId);
  });

  useEffect(() => {
    const live = new Set(terminals.map((t) => t.id));
    setTree((prev) => pruneToTerminals(prev, live));
  }, [terminals]);

  const count = leaves(tree).length;
  const shown = new Set(leaves(tree).map((l) => l.terminalId).filter((id): id is string => !!id));
  const pickNext = () => terminals.find((t) => !shown.has(t.id))?.id ?? terminals[0]?.id ?? null;

  const renderNode = (node: RemotePaneNode): ReactNode => {
    if (node.kind === "split") {
      return (
        <div className={`flex min-h-0 min-w-0 flex-1 gap-0.5 ${node.dir === "row" ? "flex-row" : "flex-col"}`}>
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderNode(node.a)}</div>
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{renderNode(node.b)}</div>
        </div>
      );
    }
    const term = terminals.find((t) => t.id === node.terminalId) ?? null;
    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded border border-[var(--border)]">
        <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--border)] bg-[var(--terminal-header)] px-1.5 py-0.5">
          <select
            value={node.terminalId ?? ""}
            onChange={(e) => setTree((t) => setLeafTerminal(t, node.id, e.target.value || null))}
            className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--terminal-header-text)] outline-none"
          >
            <option value="">Pick a terminal…</option>
            {terminals.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label || t.id}
              </option>
            ))}
          </select>
          <IconBtn onClick={() => setTree((t) => splitLeaf(t, node.id, "row", pickNext()))} title="Split right">
            <SplitRightIcon />
          </IconBtn>
          <IconBtn onClick={() => setTree((t) => splitLeaf(t, node.id, "col", pickNext()))} title="Split down">
            <SplitDownIcon />
          </IconBtn>
          {count > 1 && (
            <IconBtn onClick={() => setTree((t) => closeLeaf(t, node.id))} title="Close pane">
              <XIcon />
            </IconBtn>
          )}
        </div>
        {term ? (
          <RemoteTerminalMirror key={`${peerId}:${term.id}`} peerId={peerId} terminal={term} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-[11px] text-[var(--text-muted)]">
            Pick a terminal
          </div>
        )}
      </div>
    );
  };

  return <div className="flex min-h-0 flex-1 overflow-hidden p-1">{renderNode(tree)}</div>;
}
