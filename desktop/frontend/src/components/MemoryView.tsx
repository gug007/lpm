import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ReadMemorySessions, WriteMemorySession } from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { MEMORY_CHANGED_EVENT, type MemorySession } from "../types";
import { useNow } from "../hooks/useNow";
import { useContentZoom } from "../hooks/useContentZoom";
import { relativeTime } from "../relativeTime";
import { MessageMarkdown } from "./MessageMarkdown";
import { ZoomControl } from "./ui/ZoomControl";
import { BrainIcon, ChevronLeftIcon, PencilIcon, PlusIcon } from "./icons";

interface MemoryViewProps {
  projectName: string;
  visible: boolean;
  // The pane owns the zoom shortcuts only while it has focus, so ⌘+/⌘− still
  // resize the terminal font from anywhere else.
  focused: boolean;
}

const ZOOM_KEY = "lpm.memory-zoom";
const EDITOR_FONT_PX = 13;

type View = { kind: "list" } | { kind: "detail"; name: string } | { kind: "create" };

const slugify = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const SKELETON = (title: string) =>
  `# ${title}\n\n## Goal\n\n\n## Current state\n\n\n## Timeline\n`;

// The first line under "## Goal" — the card's one-line answer to "what is this
// workstream about", far more telling than repeating the slug.
function goalOf(content: string): string {
  const lines = content.split("\n");
  const start = lines.findIndex((l) => /^##\s+Goal\b/i.test(l.trim()));
  if (start < 0) return "";
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("##")) break;
    if (t) return t;
  }
  return "";
}

// The agent named by the newest timeline entry ("### <date> — <agent>"): who
// remembered last, the freshness signal a continuation decision actually needs.
function lastAgentOf(content: string): string {
  const entries = content.match(/^###\s.*—\s*(\S+)\s*$/gm);
  if (!entries || entries.length === 0) return "";
  const last = entries[entries.length - 1];
  return last.slice(last.lastIndexOf("—") + 1).trim();
}

// The session-memory tab (`kind: "memory"`, like the review tab): browses and
// edits the project's shared agent session memory in ~/.lpm/memory/<project>/.
// Agents write the same files, so saves are compare-and-swap and the list
// follows the memory watcher.
export function MemoryView({ projectName, visible, focused }: MemoryViewProps) {
  const [sessions, setSessions] = useState<MemorySession[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const zoom = useContentZoom(visible && focused, ZOOM_KEY);
  useNow(visible, 30000);

  const refresh = useCallback(async () => {
    try {
      const state = await ReadMemorySessions(projectName);
      setSessions(state.sessions);
    } catch {
      setSessions([]);
    }
  }, [projectName]);

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible) return;
    const off = EventsOn(MEMORY_CHANGED_EVENT, (changed: string) => {
      if (changed === projectName) void refresh();
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [visible, projectName, refresh]);

  const detail =
    view.kind === "detail" ? sessions.find((s) => s.name === view.name) : undefined;

  const startEdit = (session: MemorySession) => {
    setDraft(session.content);
    setBaseline(session.content);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await WriteMemorySession(projectName, detail.name, draft, baseline);
      setEditing(false);
      await refresh();
    } catch (err) {
      if (String(err).includes("modified")) {
        toast.error("Changed on disk by an agent — reloaded the latest version");
        setEditing(false);
        await refresh();
      } else {
        toast.error(`Save memory: ${String(err)}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    const name = slugify(newTitle);
    if (!name) return;
    if (sessions.some((s) => s.name === name)) {
      setView({ kind: "detail", name });
      setNewTitle("");
      return;
    }
    setSaving(true);
    try {
      await WriteMemorySession(projectName, name, SKELETON(newTitle.trim()), undefined);
      await refresh();
      setNewTitle("");
      setView({ kind: "detail", name });
    } catch (err) {
      toast.error(`Create memory: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const backToList = () => {
    setEditing(false);
    setView({ kind: "list" });
  };

  const stamp = (s: MemorySession) => {
    const agent = lastAgentOf(s.content);
    return (
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
        {agent && <span className="text-[var(--accent-purple)]">{agent}</span>}
        {agent && " · "}
        {relativeTime(s.updatedAt)}
      </span>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
        {view.kind !== "list" && (
          <button
            onClick={backToList}
            aria-label="Back"
            className="-ml-1.5 flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <ChevronLeftIcon />
          </button>
        )}
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-primary)]">
          <span className="text-[var(--accent-purple)]">
            <BrainIcon />
          </span>
          Memory
        </span>
        {view.kind === "list" && sessions.length > 0 && (
          <span className="text-xs text-[var(--text-muted)]">{sessions.length}</span>
        )}
        {detail && (
          <>
            <span className="text-[var(--text-muted)]/60">/</span>
            <span className="min-w-0 truncate text-[13px] text-[var(--text-secondary)]">
              {detail.title}
            </span>
          </>
        )}
        <div className="flex-1" />
        {(detail || (view.kind === "list" && sessions.length > 0)) && (
          <ZoomControl
            percent={zoom.percent}
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            onReset={zoom.zoomReset}
            canZoomIn={zoom.canZoomIn}
            canZoomOut={zoom.canZoomOut}
          />
        )}
        {detail && !editing && (
          <>
            {stamp(detail)}
            <button
              onClick={() => startEdit(detail)}
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <PencilIcon size={12} />
              Edit
            </button>
          </>
        )}
        {view.kind === "list" && sessions.length > 0 && (
          <button
            onClick={() => setView({ kind: "create" })}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            <PlusIcon />
            New session
          </button>
        )}
      </div>

      {view.kind === "list" && sessions.length === 0 && (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6">
          <div className="flex w-full max-w-sm flex-col items-center gap-3 pb-16 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-purple)]/10 text-[var(--accent-purple)]">
              <BrainIcon />
            </span>
            <div className="text-sm font-medium text-[var(--text-primary)]">No memory yet</div>
            <p className="text-xs leading-5 text-[var(--text-muted)]">
              Ask an agent to remember the session, or start one here — any agent
              can pick it up later and continue the work.
            </p>
            <button
              onClick={() => setView({ kind: "create" })}
              className="mt-1 flex items-center gap-1 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-xs font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-85"
            >
              <PlusIcon />
              New session
            </button>
          </div>
        </div>
      )}

      {view.kind === "list" && sessions.length > 0 && (
        <div className="min-h-0 flex-1 overflow-y-auto" ref={zoom.surfaceRef}>
          <div className="mx-auto max-w-2xl px-6 py-5" style={{ zoom: zoom.zoom }}>
            <ul className="flex flex-col gap-2.5">
              {sessions.map((s) => {
                const goal = goalOf(s.content);
                const subtitle = goal || (s.name !== s.title ? s.name : "");
                return (
                  <li key={s.name}>
                    <button
                      onClick={() => setView({ kind: "detail", name: s.name })}
                      className="flex w-full flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/50 px-4 py-3.5 text-left transition-colors hover:border-[var(--accent-purple)]/40 hover:bg-[var(--bg-hover)]"
                    >
                      <span className="flex w-full items-baseline gap-3">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text-primary)]">
                          {s.title}
                        </span>
                        {stamp(s)}
                      </span>
                      {subtitle && (
                        <span className="line-clamp-1 text-xs leading-5 text-[var(--text-muted)]">
                          {subtitle}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {view.kind === "detail" && !detail && (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-16 text-sm text-[var(--text-muted)]">
          This session was removed.
        </div>
      )}

      {detail && !editing && (
        <div
          className="min-h-0 flex-1 cursor-text overflow-y-auto"
          onDoubleClick={() => startEdit(detail)}
          ref={zoom.surfaceRef}
        >
          <div className="mx-auto max-w-2xl px-8 py-6" style={{ zoom: zoom.zoom }}>
            <MessageMarkdown text={detail.content} />
          </div>
        </div>
      )}

      {detail && editing && (
        <div className="flex min-h-0 flex-1 flex-col">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key.toLowerCase() === "s")) {
                e.preventDefault();
                if (!saving && draft !== baseline) void saveEdit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
              }
            }}
            spellCheck={false}
            autoFocus
            style={{ fontSize: EDITOR_FONT_PX * zoom.zoom, lineHeight: 1.7 }}
            className="min-h-0 w-full flex-1 resize-none bg-[var(--bg-primary)] px-8 py-5 font-mono text-[var(--text-primary)] focus:outline-none"
          />
          <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
            <span className="flex-1 text-[11px] text-[var(--text-muted)]">⌘⏎ save · esc cancel</span>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              onClick={() => void saveEdit()}
              disabled={saving || draft === baseline}
              className="rounded-md bg-[var(--text-primary)] px-2.5 py-1 text-xs font-medium text-[var(--bg-primary)] transition-opacity disabled:opacity-40 hover:opacity-85"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {view.kind === "create" && (
        <div className="flex min-h-0 flex-1 justify-center px-6 pt-14">
          <div className="w-full max-w-md">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              New session
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
              className="flex items-center gap-2"
            >
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="What is this session about?"
                className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-sidebar)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-purple)]/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={saving || !slugify(newTitle)}
                className="rounded-lg bg-[var(--text-primary)] px-3 py-2 text-sm font-medium text-[var(--bg-primary)] transition-opacity disabled:opacity-40 hover:opacity-85"
              >
                Create
              </button>
            </form>
            {slugify(newTitle) && (
              <div className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
                ~/.lpm/memory/{projectName}/{slugify(newTitle)}.md
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
