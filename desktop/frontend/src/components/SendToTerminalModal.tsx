import { useEffect, useMemo, useRef, useState } from "react";
import { PeerState } from "../../bridge/commands";
import { Modal } from "./ui/Modal";
import { XIcon } from "./icons";
import { useAppStore } from "../store/app";
import { useGlobalAgentStatus } from "../store/globalAgentStatus";
import { useTerminalTargets } from "../store/terminalTargets";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { derivePaneStatus } from "../hooks/usePaneStatus";
import { type AgentState } from "../agentStatus";
import { SendTargetItem } from "./SendTargetItem";
import { parsePeerMarker } from "../peer/markers";
import { peerAliasMap, type PeerClient } from "../peer/usePeerState";
import { buildSendTargets, flattenTargets, type SendTargetRow } from "../sendTargets";

// Run the prompt in the tab you pick, or move it there unsent so it waits in that
// tab's input.
export type SendTargetMode = "send" | "move";

interface SendToTerminalModalProps {
  open: boolean;
  onClose: () => void;
  sourceProject: string;
  sourceTerminalId: string;
  // A prompt carrying images can't cross machines: the paths it holds are files
  // on the Mac it was composed on, and the receiving agent opens them itself.
  hasImages: boolean;
  busy: boolean;
  onPick: (row: SendTargetRow, mode: SendTargetMode) => void;
}

const VERB = { send: "send", move: "move to input" } as const;

export function SendToTerminalModal({
  open,
  onClose,
  sourceProject,
  sourceTerminalId,
  hasImages,
  busy,
  onPick,
}: SendToTerminalModalProps) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const byProject = useTerminalTargets((s) => s.byProject);
  const projects = useAppStore((s) => s.projects);
  const mru = useAppStore((s) => s.mruProjects);
  const globalEntries = useGlobalAgentStatus((s) => s.entries);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setCursor(0);
    const t = setTimeout(() => searchRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // Two paired Macs can each have a project called "web", and a peer project
  // carries the other Mac's own name for it. Read the aliases when the picker
  // opens — once per open, rather than holding a subscription in every composer —
  // so those two groups don't read identically.
  const [peerNames, setPeerNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!open) return;
    let live = true;
    void PeerState()
      .then((state: { peers?: PeerClient[] }) => {
        if (live) setPeerNames(peerAliasMap(state?.peers ?? []));
      })
      .catch(() => {
        /* nothing paired, or the peer server is still starting */
      });
    return () => {
      live = false;
    };
  }, [open]);

  const groups = useMemo(
    () =>
      buildSendTargets({
        byProject,
        labelOf: (name) => displayNameForProjectName(name, projects),
        sourceProject,
        sourceTerminalId,
        mru,
        query,
      }),
    [byProject, projects, sourceProject, sourceTerminalId, mru, query],
  );

  // What each target's agent is doing, so a busy tab says so before the prompt is
  // queued behind its turn, and a tab holding a permission prompt leads with move
  // instead of send. A tab with no agent reporting shows nothing.
  const states = useMemo(() => {
    if (!open) return new Map<string, AgentState>();
    const now = Date.now();
    const out = new Map<string, AgentState>();
    for (const project of projects) {
      for (const [id, status] of derivePaneStatus(project.statusEntries, now).agents) {
        out.set(id, status.state);
      }
    }
    for (const [id, status] of derivePaneStatus(globalEntries, now).agents) {
      out.set(id, status.state);
    }
    return out;
  }, [open, projects, globalEntries]);

  const rows = useMemo(() => flattenTargets(groups), [groups]);
  const active = rows[Math.min(cursor, rows.length - 1)];
  // A prompt with images can only go where those files are.
  const blocked = (row: SendTargetRow) => hasImages && row.offHost;
  // Sending ends in a carriage return; into a permission prompt that is an answer
  // to it, so those tabs lead with the verb that types nothing.
  const primaryFor = (row: SendTargetRow): SendTargetMode =>
    states.get(row.terminalId) === "needs-you" ? "move" : "send";

  // Keep the highlighted row in view as the arrows walk past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active='true']")
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor, query]);

  const pick = (row: SendTargetRow, mode: SendTargetMode) => {
    if (busy || blocked(row)) return;
    onPick(row, mode);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (rows.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setCursor((i) => (Math.min(i, rows.length - 1) + delta + rows.length) % rows.length);
      return;
    }
    if (e.key === "Enter" && active) {
      e.preventDefault();
      const primary = primaryFor(active);
      pick(active, e.metaKey || e.ctrlKey ? (primary === "send" ? "move" : "send") : primary);
    }
  };

  const activePrimary = active ? primaryFor(active) : "send";
  const hostOf = (projectName: string) => peerNames[parsePeerMarker(projectName)?.slug ?? ""];

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      zIndexClassName="z-[90]"
      contentClassName="w-[460px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Send to another tab</h3>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
          className="rounded-md p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
        >
          <XIcon />
        </button>
      </div>

      <div className="border-b border-[var(--border)] p-2">
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search tabs and projects"
          aria-label="Search tabs and projects"
          data-text-scope=""
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full rounded-lg bg-transparent px-3 py-2 text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
        />
      </div>

      <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1.5">
        {rows.length === 0 && (
          <div className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
            {query.trim()
              ? "No matches"
              : "Nothing to send to yet — only projects you've opened this session have tabs."}
          </div>
        )}
        {groups.map((group) => (
          <div key={group.projectName}>
            <div className="flex items-baseline gap-1.5 px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
              <span className="truncate">{group.projectLabel}</span>
              {group.projectName === sourceProject && (
                <span className="shrink-0 normal-case tracking-normal opacity-70">this project</span>
              )}
              {hostOf(group.projectName) && (
                <span className="shrink-0 normal-case tracking-normal opacity-70">
                  on {hostOf(group.projectName)}
                </span>
              )}
            </div>
            {group.rows.map((row) => (
              <SendTargetItem
                key={row.terminalId}
                row={row}
                state={states.get(row.terminalId)}
                active={active?.terminalId === row.terminalId}
                disabled={busy || blocked(row)}
                blockedReason={blocked(row) ? "Another Mac" : undefined}
                primary={primaryFor(row)}
                onPick={pick}
                onHover={() => setCursor(rows.indexOf(row))}
              />
            ))}
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div className="border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)]">
          ↵ {VERB[activePrimary]} · ⌘↵ {VERB[activePrimary === "send" ? "move" : "send"]}
        </div>
      )}
    </Modal>
  );
}
