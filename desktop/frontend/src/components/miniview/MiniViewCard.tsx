import { useEffect, useMemo, useRef } from "react";
import { useAgentDialog } from "../../agentDialogScreen";
import { statusProvider, providerMeta } from "../../agentStatus";
import { useMiniViewResize } from "../../hooks/useMiniViewResize";
import { useMiniViewScreen } from "../../hooks/useMiniViewScreen";
import { MINI_VIEW_DEFAULT_SIZE, miniViewRows } from "../../miniViewSize";
import { projectAgentRows } from "../../sidebarAgents";
import { useAppStore } from "../../store/app";
import { useMiniViews, type MiniView } from "../../store/miniViews";
import { useTerminalTitles } from "../../store/terminalTitles";
import type { AICLI } from "../../types";
import { AgentShellChip } from "../AgentShellChip";
import { AgentStateIcon } from "../AgentStateIcon";
import { TerminalIcon, XIcon } from "../icons";
import { SidebarAgentElapsed } from "../SidebarAgentElapsed";
import { AgentGlyph } from "../terminal/AgentGlyph";
import { MiniViewReply } from "./MiniViewReply";
import { MiniViewResizeEdges } from "./MiniViewResizeEdges";

const BORDER = {
  "needs-you": "border-[var(--accent-amber)]/60",
  error: "border-[var(--accent-red)]/60",
} as const;

/** One kept tab: its name, state and time, its last lines of output, and a way
 *  to answer its agent. A click opens the tab itself. */
export function MiniViewCard({ view }: { view: MiniView }) {
  const project = useAppStore((s) => s.projects.find((p) => p.name === view.project));
  const title = useTerminalTitles((s) => s.byProject[view.project]?.[view.termId]) || view.label;
  const size = view.size ?? MINI_VIEW_DEFAULT_SIZE;
  const cardRef = useRef<HTMLDivElement>(null);
  const resize = useMiniViewResize(view.termId, size, cardRef);
  const { lines, alive } = useMiniViewScreen(view.termId, miniViewRows(size.height));
  const dialog = useAgentDialog(view.termId);
  const drop = useMiniViews((s) => s.drop);

  useEffect(() => {
    if (!alive) drop(view.termId);
  }, [alive, drop, view.termId]);

  // An agent whose finish was already seen has left the status list for the seen
  // one, and still says what it is and how long it took.
  const row = useMemo(() => {
    if (!project) return undefined;
    const statusEntries = [...(project.statusEntries ?? []), ...(project.seenEntries ?? [])];
    return projectAgentRows({ statusEntries }, Date.now()).find((r) => r.terminalId === view.termId);
  }, [project, view.termId]);
  const status = row ? statusProvider(row.key) : "unknown";
  const agent = status !== "unknown" ? (status as AICLI) : (view.agent ?? null);
  const agentName = agent ? providerMeta(agent).short : "the agent";
  const state = row?.state ?? "idle";
  const tone = state === "needs-you" || state === "error" ? BORDER[state] : "border-[var(--border)]";
  const open = () => useAppStore.getState().focusProjectTerminal(view.project, view.termId);

  return (
    <div
      ref={cardRef}
      data-mini-view={view.termId}
      onClick={open}
      title={`Open ${title}`}
      style={{ width: size.width }}
      className={`pointer-events-auto relative max-w-[calc(100vw-32px)] cursor-pointer overflow-hidden rounded-xl border bg-[var(--bg-secondary)] shadow-2xl transition-colors hover:border-[var(--text-muted)] ${tone}`}
    >
      <MiniViewResizeEdges onStart={resize.start} onReset={resize.reset} />
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2.5 py-1.5 text-[11.5px]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
          aria-label={`Open ${title}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded text-left outline-none focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]"
        >
          {agent ? <AgentGlyph agent={agent} size={13} /> : <TerminalIcon />}
          <span className="min-w-0 flex-1 truncate text-[var(--text-primary)]">
            <span className="text-[var(--text-muted)]">{project?.label || view.project} · </span>
            {title}
          </span>
        </button>
        {row?.pause ? (
          <AgentShellChip pause={row.pause} />
        ) : (
          row && (
            <span className="flex shrink-0 items-center gap-1 text-[var(--text-secondary)]">
              <AgentStateIcon state={row.state} />
              <SidebarAgentElapsed agent={row} />
            </span>
          )
        )}
        <button
          type="button"
          aria-label={`Close the mini view of ${title}`}
          title="Close the mini view"
          onClick={(e) => {
            e.stopPropagation();
            drop(view.termId);
          }}
          className="-mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </div>
      <div
        style={{ height: size.height }}
        className="flex max-h-[calc(100vh-240px)] flex-col justify-end overflow-hidden bg-[var(--terminal-bg)] px-2.5 py-1.5 font-mono text-[10.5px] leading-[15px] text-[var(--text-secondary)]"
      >
        {lines.map((line, i) => (
          <div key={i} className="shrink-0 whitespace-pre-wrap break-words">
            {line || " "}
          </div>
        ))}
      </div>
      <MiniViewReply
        terminalId={view.termId}
        agentName={agentName}
        dialog={dialog}
        waiting={state === "needs-you"}
      />
    </div>
  );
}
