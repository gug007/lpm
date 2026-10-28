import { STATUS_DONE, STATUS_ERROR, type StatusEntry } from "../../types";
import type { AgentStatus } from "../agents/api";
import type { CommandMap } from "../backend";
import { emitEvent } from "../ipc";
import { keepsFinishedAgents } from "./settings";
import type { AgentKind } from "../seed/types";

// One entry per terminal, keyed the way each CLI's hooks key it.
const byProject = new Map<string, Map<string, StatusEntry>>();
// Finished agents the visitor opened, per terminal, as status/seen.rs keeps them.
const seenByProject = new Map<string, Map<string, StatusEntry>>();

function panesOf(store: Map<string, Map<string, StatusEntry>>, project: string): Map<string, StatusEntry> {
  const panes = store.get(project) ?? new Map<string, StatusEntry>();
  store.set(project, panes);
  return panes;
}

export function statusKey(kind: AgentKind, sessionId: string, paneId: string): string {
  return kind === "claude" ? `claude_code_${sessionId}` : `${kind}_${paneId}`;
}

function notify(project: string): void {
  emitEvent("status-changed", project);
}

export function setAgentStatus(project: string, paneId: string, key: string, status: AgentStatus | null): void {
  const panes = panesOf(byProject, project);
  seenByProject.get(project)?.delete(paneId);
  if (!status) panes.delete(paneId);
  else {
    const timestamp = status.value === "Running" ? status.turnStart : (status.endedAt ?? status.turnStart);
    panes.set(paneId, {
      key,
      value: status.value,
      priority: 0,
      paneID: paneId,
      timestamp,
      turnStart: status.turnStart,
      endedAt: status.endedAt,
    });
  }
  notify(project);
}

// A seeded session's row moves to the terminal that reopens it.
export function movePaneStatus(project: string, from: string, to: string): void {
  let moved = false;
  for (const panes of [byProject.get(project), seenByProject.get(project)]) {
    const entry = panes?.get(from);
    if (!panes || !entry) continue;
    panes.delete(from);
    panes.set(to, { ...entry, paneID: to });
    moved = true;
  }
  if (moved) notify(project);
}

export function statusEntries(project: string): StatusEntry[] {
  return [...(byProject.get(project)?.values() ?? [])];
}

export function seenStatusEntries(project: string): StatusEntry[] {
  return [...(seenByProject.get(project)?.values() ?? [])];
}

export function dropProjectStatus(project: string): void {
  byProject.delete(project);
  seenByProject.delete(project);
}

const isFinished = (e: StatusEntry) => e.value === STATUS_DONE || e.value === STATUS_ERROR;

function see(project: string, pick: (e: StatusEntry) => boolean): boolean {
  const panes = byProject.get(project);
  let changed = false;
  for (const [pane, entry] of panes ?? []) {
    if (!isFinished(entry) || !pick(entry)) continue;
    panes?.delete(pane);
    panesOf(seenByProject, project).set(pane, { ...entry, seenAt: Date.now() });
    changed = true;
  }
  return changed;
}

function dropWhere(store: Map<string, Map<string, StatusEntry>>, project: string, pick: (e: StatusEntry) => boolean): boolean {
  const panes = store.get(project);
  let changed = false;
  for (const [pane, entry] of panes ?? []) {
    if (!pick(entry)) continue;
    panes?.delete(pane);
    changed = true;
  }
  return changed;
}

function clear({ project, paneId, value }: Record<string, unknown>): null {
  const name = String(project);
  const onPane = (e: StatusEntry) => e.paneID === String(paneId) && e.value === String(value);
  if ((keepsFinishedAgents() && see(name, onPane)) || dropWhere(byProject, name, onPane)) notify(name);
  return null;
}

function archive(name: string, picked: Set<string>): boolean {
  const seen = dropWhere(seenByProject, name, (e) => picked.has(e.key));
  return dropWhere(byProject, name, (e) => isFinished(e) && picked.has(e.key)) || seen;
}

function clearPane({ project, paneId }: Record<string, unknown>): null {
  const name = String(project);
  const onPane = (e: StatusEntry) => e.paneID === String(paneId);
  const live = dropWhere(byProject, name, onPane);
  if (dropWhere(seenByProject, name, onPane) || live) notify(name);
  return null;
}

const keysOf = (keys: unknown) => new Set(Array.isArray(keys) ? keys.map(String) : []);

export const statusCommands: CommandMap = {
  clear_status: clear,
  clear_pane_status: clearPane,
  archive_agent_status: ({ project, keys }) => {
    const name = String(project);
    if (archive(name, keysOf(keys))) notify(name);
    return null;
  },
  mark_agent_status_seen: ({ project, keys }) => {
    const name = String(project);
    const picked = keysOf(keys);
    const changed = keepsFinishedAgents() ? see(name, (e) => picked.has(e.key)) : archive(name, picked);
    if (changed) notify(name);
    return null;
  },
  mark_agent_status_unread: ({ project, keys }) => {
    const name = String(project);
    const picked = keysOf(keys);
    for (const [pane, entry] of seenByProject.get(name) ?? []) {
      if (!picked.has(entry.key)) continue;
      seenByProject.get(name)?.delete(pane);
      const { seenAt: _seenAt, ...unread } = entry;
      panesOf(byProject, name).set(pane, unread);
      notify(name);
    }
    return null;
  },
  move_pane_status: ({ project, oldPaneId, newPaneId }) => {
    movePaneStatus(String(project), String(oldPaneId), String(newPaneId));
    return null;
  },
};
