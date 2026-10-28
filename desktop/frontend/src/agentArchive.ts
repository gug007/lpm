import { create } from "zustand";
import { ArchiveAgentStatus, MarkAgentStatusSeen, MarkAgentStatusUnread } from "../bridge/commands";
import { showUndoCloseToast } from "./components/UndoCloseToast";
import type { Chord } from "./keys";
import { toast } from "./notifications/toast";
import { UNDO_CLOSE_DURATION_MS } from "./pendingClose";
import type { SidebarAgentRow } from "./sidebarAgents";

/** Archive the agent on screen. */
export const ARCHIVE_AGENT_CHORD: Chord = { key: "a", meta: true, shift: true };

const TOAST_ID = "archive-agents";
// How long an archived row stays hidden after the Mac took it, so the list it
// still holds until its refresh lands doesn't flash the row back.
const SETTLE_MS = 1500;

interface ArchiveBatch {
  project: string;
  keys: string[];
  rows: number;
}

interface ArchivingState {
  // Project -> status keys whose rows are hidden while their archive waits on
  // its Undo, or has just been sent.
  hidden: Record<string, string[]>;
  hide: (project: string, keys: string[]) => void;
  show: (project: string, keys: string[]) => void;
}

export const useArchivingAgents = create<ArchivingState>((set) => ({
  hidden: {},
  hide: (project, keys) =>
    set((s) => ({
      hidden: { ...s.hidden, [project]: [...new Set([...(s.hidden[project] ?? []), ...keys])] },
    })),
  show: (project, keys) =>
    set((s) => {
      const left = (s.hidden[project] ?? []).filter((k) => !keys.includes(k));
      const hidden = { ...s.hidden };
      if (left.length) hidden[project] = left;
      else delete hidden[project];
      return { hidden };
    }),
}));

const NO_KEYS: ReadonlySet<string> = new Set();

export function hiddenKeys(hidden: Record<string, string[]>, project: string): ReadonlySet<string> {
  const keys = hidden[project];
  return keys ? new Set(keys) : NO_KEYS;
}

// What the toast on screen covers; one Undo takes back all of it.
let batch: ArchiveBatch[] = [];

function toastTitle(rows: SidebarAgentRow[], where: string | undefined): string {
  const total = batch.reduce((n, b) => n + b.rows, 0);
  if (where && batch.length === 1 && total > 1) return `Archived ${total} agents in ${where}`;
  return total === 1 ? `Archived “${rows[0].title}”` : `Archived ${total} agents`;
}

/** Take rows off the sidebar behind an Undo: hidden now, archived on the Mac
 *  once the toast runs out. Archiving more while it shows adds to it. `where`
 *  names the project in the toast when several of its rows go at once. */
export function archiveAgents(project: string, rows: SidebarAgentRow[], where?: string): void {
  const keys = rows.flatMap((r) => r.keys);
  if (keys.length === 0) return;
  useArchivingAgents.getState().hide(project, keys);
  batch.push({ project, keys, rows: rows.length });
  showUndoCloseToast({
    toastId: TOAST_ID,
    title: toastTitle(rows, where),
    durationMs: UNDO_CLOSE_DURATION_MS,
    onUndo: undoArchive,
    onFinalize: commitArchive,
  });
}

function undoArchive(): void {
  const undone = batch;
  batch = [];
  for (const b of undone) useArchivingAgents.getState().show(b.project, b.keys);
  toast.dismiss(TOAST_ID);
}

function commitArchive(): void {
  const byProject = new Map<string, string[]>();
  for (const b of batch) byProject.set(b.project, [...(byProject.get(b.project) ?? []), ...b.keys]);
  batch = [];
  for (const [project, keys] of byProject) {
    const show = () => useArchivingAgents.getState().show(project, keys);
    ArchiveAgentStatus(project, keys)
      .then(() => setTimeout(show, SETTLE_MS))
      .catch((err: unknown) => {
        show();
        toast.error("Couldn't archive", { description: String(err) });
      });
  }
}

export function markAgentSeen(project: string, row: SidebarAgentRow): void {
  MarkAgentStatusSeen(project, row.keys).catch(() => {});
}

export function markAgentUnread(project: string, row: SidebarAgentRow): void {
  MarkAgentStatusUnread(project, row.keys).catch(() => {});
}
