"use client";

import type { Dispatch, SetStateAction } from "react";
import { ConfirmDialog } from "./confirm-dialog";
import type { AiStatus, DemoGit, DemoProject } from "./projects";
import type { PaneNode } from "./pane-tree";
import type { ActionTerminalMap, AgentTabState } from "./project-view";

export type RemoveProjectDeps = {
  projects: DemoProject[];
  selected: string;
  selectProject: (name: string) => void;
  setSelected: Dispatch<SetStateAction<string>>;
  setProjects: Dispatch<SetStateAction<DemoProject[]>>;
  setRunningByProject: Dispatch<SetStateAction<Record<string, Set<string>>>>;
  setGitByProject: Dispatch<SetStateAction<Record<string, DemoGit>>>;
  setAiStatusByProject: Dispatch<SetStateAction<Record<string, AiStatus>>>;
  setTreeByProject: Dispatch<SetStateAction<Record<string, PaneNode | null>>>;
  setActionTerminalsByProject: Dispatch<
    SetStateAction<Record<string, ActionTerminalMap>>
  >;
  setAgentTabStatusByProject: Dispatch<
    SetStateAction<Record<string, Record<string, AgentTabState>>>
  >;
  setVisited: Dispatch<SetStateAction<Set<string>>>;
};

// Removing a project drops its whole record: every per-project map is keyed
// by name, so a leftover slice would come back to life the moment a copy
// reused the name.
export function removeProject(name: string, deps: RemoveProjectDeps) {
  const at = deps.projects.findIndex((p) => p.name === name);
  if (at < 0) return;
  const without = <T,>(rec: Record<string, T>): Record<string, T> => {
    if (!(name in rec)) return rec;
    const next = { ...rec };
    delete next[name];
    return next;
  };
  deps.setProjects((prev) => prev.filter((p) => p.name !== name));
  deps.setRunningByProject(without);
  deps.setGitByProject(without);
  deps.setAiStatusByProject(without);
  deps.setTreeByProject(without);
  deps.setActionTerminalsByProject(without);
  deps.setAgentTabStatusByProject(without);
  deps.setVisited((prev) => {
    if (!prev.has(name)) return prev;
    const next = new Set(prev);
    next.delete(name);
    return next;
  });
  if (deps.selected !== name) return;
  // The row that slid into its place, or the one above it if it was last.
  const remaining = deps.projects.filter((p) => p.name !== name);
  const fallback = remaining[at] ?? remaining[at - 1];
  if (fallback) deps.selectProject(fallback.name);
  else deps.setSelected("");
}

export function RemoveProjectDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      title="Remove from lpm"
      body={
        <>
          <span className="text-[#e5e5e5]">{name}</span> disappears from this
          list. The folder on disk is left exactly as it is.
        </>
      }
      confirmLabel="Remove"
      danger
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
