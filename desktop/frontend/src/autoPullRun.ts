import { createElement } from "react";
import { toast } from "./notifications/toast";
import { GitAutoPull, GitAutoPullUndo, SetAutoPull } from "../bridge/commands";
import { autoPullState, autoPullTarget, commitsText, normalizeAutoPullMode, wantsAutoPull } from "./autoPull";
import { AutoPullRows } from "./components/AutoPullRows";
import { displayNameForProjectName } from "./components/ProjectNameDisplay";
import { recheckOrigin, showOriginDone } from "./originActions";
import { projectAgentRows } from "./sidebarAgents";
import { useAppStore } from "./store/app";
import { useOriginStatus } from "./store/originStatus";
import { getSettings } from "./store/settings";
import type { ProjectInfo } from "./types";

export interface AutoPulled {
  branch: string;
  count: number;
  from: string;
  to: string;
  at: number;
}

type AutoPullOutcome = ({ kind: "pulled" } & AutoPulled) | { kind: "skipped"; reason: string };

export interface Announced {
  root: string;
  project: string;
  name: string;
  pulled: AutoPulled;
}

const TOAST_ID = "auto-pull";
// What an Undo click led to. A toast closes once its action is clicked, so the
// result is a note of its own, with a full lifetime.
const RESULT_ID = "auto-pull-result";
const TOAST_MS = 10_000;
const SETTLE_MS = 1_500;

// Roots not to try again until origin or the branch moves: a pull git refused,
// or one the user just undid.
const heldAt = new Map<string, { key: string; reason: "failed" | "undone" }>();
let announced: Announced[] = [];
let announcedTimer: ReturnType<typeof setTimeout> | undefined;
let sweeping = false;

const attemptKey = (root: string) => {
  const status = useOriginStatus.getState().entries[root]?.status;
  return status ? `${status.branch}:${status.behind}` : "";
};

function nameOf(project: ProjectInfo): string {
  return displayNameForProjectName(project.name, useAppStore.getState().projects);
}

// An agent mid-task, or stopped on a question, is working from the files it read.
function agentBusy(project: ProjectInfo): boolean {
  return projectAgentRows(project, Date.now()).some(
    (row) => row.state === "working" || row.state === "needs-you",
  );
}

function autoPullProject(root: string): ProjectInfo | undefined {
  const mode = normalizeAutoPullMode(getSettings().autoPull);
  if (mode === "off") return undefined;
  const projects = useAppStore.getState().projects;
  const project = autoPullTarget(projects, root);
  if (!project || !autoPullState(project, projects, mode).on || agentBusy(project)) return undefined;
  return project;
}

// Fast-forward the project at `root` if its last origin check says it's a clean
// pull and its setting allows it. Called right after each check.
export async function maybeAutoPull(root: string): Promise<void> {
  const entry = useOriginStatus.getState().entries[root];
  if (!entry || entry.running || !wantsAutoPull(entry.status)) return;
  const attempt = attemptKey(root);
  if (heldAt.get(root)?.key === attempt) return;
  const project = autoPullProject(root);
  if (!project) return;

  useOriginStatus.getState().setRunning(root, true);
  let outcome: AutoPullOutcome | undefined;
  try {
    outcome = (await GitAutoPull(root)) as AutoPullOutcome;
    heldAt.delete(root);
  } catch (err) {
    heldAt.set(root, { key: attempt, reason: "failed" });
    toast.error(`Auto pull stopped in ${nameOf(project)}: ${String(err)}`);
  }
  await recheckOrigin(root);
  useOriginStatus.getState().setRunning(root, false);
  if (outcome?.kind !== "pulled") return;
  showOriginDone(root, `Pulled ${outcome.count}`);
  announce({ root, project: project.name, name: nameOf(project), pulled: outcome });
}

// Why a project that auto pull is on for still has commits to pull.
export type AutoPullWait = "changes" | "agent" | "failed" | "undone" | "next";

export function autoPullWait(project: ProjectInfo): AutoPullWait {
  const held = heldAt.get(project.root);
  if (held?.key === attemptKey(project.root)) return held.reason;
  if ((useOriginStatus.getState().entries[project.root]?.status.changes ?? 0) > 0) return "changes";
  if (agentBusy(project)) return "agent";
  return "next";
}

// Every checked project in turn, for when a setting has just turned auto pull on.
export function autoPullSoon(): void {
  setTimeout(async () => {
    if (sweeping) return;
    sweeping = true;
    try {
      for (const root of Object.keys(useOriginStatus.getState().entries)) await maybeAutoPull(root);
    } finally {
      sweeping = false;
    }
  }, SETTLE_MS);
}

function announce(item: Announced): void {
  announced = [...announced.filter((a) => a.root !== item.root), item];
  clearTimeout(announcedTimer);
  announcedTimer = setTimeout(() => {
    announced = [];
  }, TOAST_MS);
  showAnnounced();
}

export function openAutoPullSettings(): void {
  const { setSettingsTab, setView } = useAppStore.getState();
  setSettingsTab("git");
  setView("settings");
}

// The pulls of the last few seconds as one toast: a single pull says what came
// in; several list each project with its own Undo.
function showAnnounced(): void {
  const items = announced;
  if (items.length === 0) {
    toast.dismiss(TOAST_ID);
    return;
  }
  if (items.length === 1) {
    const [item] = items;
    const { pulled } = item;
    toast.success(`Pulled ${commitsText(pulled.count)} into ${item.name}`, {
      id: TOAST_ID,
      description: `${pulled.branch} · ${pulled.from} → ${pulled.to}`,
      duration: TOAST_MS,
      event: "autoPull",
      action: { label: "Undo", onClick: () => void undoAutoPull(item.root, item.project, item.name) },
    });
    return;
  }
  const commits = items.reduce((sum, i) => sum + i.pulled.count, 0);
  toast.success(`Pulled ${items.length} projects`, {
    id: TOAST_ID,
    description: `${commitsText(commits)} from origin`,
    duration: TOAST_MS,
    event: "autoPull",
    content: createElement(AutoPullRows, {
      rows: items,
      onUndo: (item) => void undoAutoPull(item.root, item.project, item.name),
    }),
    action: { label: "Undo all", onClick: () => void undoAll(items) },
    cancel: { label: "Auto pull settings", onClick: openAutoPullSettings },
  });
}

async function undoOne(root: string): Promise<AutoPulled> {
  try {
    return (await GitAutoPullUndo(root)) as AutoPulled;
  } finally {
    announced = announced.filter((a) => a.root !== root);
    showAnnounced();
    await recheckOrigin(root);
    heldAt.set(root, { key: attemptKey(root), reason: "undone" });
  }
}

export async function undoAutoPull(root: string, project: string, name: string): Promise<void> {
  try {
    const undone = await undoOne(root);
    toast.success(`Undid the pull in ${name}`, {
      id: RESULT_ID,
      description: `Back on ${undone.from}. Auto pull waits for newer commits on origin.`,
      duration: TOAST_MS,
      action: { label: "Turn off auto pull", onClick: () => void turnOff(project, name) },
    });
  } catch (err) {
    toast.error(`Couldn’t undo the pull in ${name}: ${String(err)}`, { id: RESULT_ID });
  }
}

async function undoAll(items: Announced[]): Promise<void> {
  const failed: string[] = [];
  for (const item of items) {
    try {
      await undoOne(item.root);
    } catch {
      failed.push(item.name);
    }
  }
  if (failed.length > 0) {
    toast.error(`Couldn’t undo the pull in ${failed.join(", ")}: the branch has moved since`, { id: RESULT_ID });
    return;
  }
  toast.success(`Undid ${items.length} pulls`, {
    id: RESULT_ID,
    description: "Auto pull waits for newer commits on origin.",
    duration: TOAST_MS,
  });
}

// A project's own choice: on, off, or null to follow its parent and Settings.
export async function setProjectAutoPull(project: string, value: boolean | null): Promise<boolean> {
  try {
    await SetAutoPull(project, value);
  } catch (err) {
    toast.error(`Couldn’t change auto pull: ${String(err)}`);
    return false;
  }
  if (value !== false) autoPullSoon();
  return true;
}

async function turnOff(project: string, name: string): Promise<void> {
  if (await setProjectAutoPull(project, false)) {
    toast.success(`Auto pull is off for ${name}`, { duration: TOAST_MS });
  }
}
