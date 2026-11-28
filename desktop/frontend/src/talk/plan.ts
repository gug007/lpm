import { findParentProject, projectDisplayName } from "../components/ProjectNameDisplay";
import { peerSlugOf } from "../peer/markers";
import { startPromptInNewTab } from "../sendToNewTab";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";
import { AI_CLI_OPTIONS, type ProjectInfo } from "../types";

export type TalkPlace = "copy" | "worktree" | "here";

// What the Talk button made of one sentence (talkplan.rs, PROTOCOL.md "Talk").
// `project` is "" until the owner says which one was meant.
export interface TalkPlan {
  project: string;
  where: TalkPlace;
  agent: string;
  prompt: string;
  label: string;
}

export type TalkReply =
  | { ok: true; plan: TalkPlan; candidates: string[] }
  | { ok: false; error: string; unsupported: boolean };

export interface TalkProjectOption {
  name: string;
  label: string;
  parent: string;
}

export interface TalkAgentOption {
  id: string;
  label: string;
}

export interface TalkPlaceOption {
  id: TalkPlace;
  // The first row's title while this place is picked.
  label: string;
  // The place in the menu that changes it.
  choice: string;
}

export const WHICH_PROJECT = "Which project?";

export const TALK_AGENTS: TalkAgentOption[] = AI_CLI_OPTIONS.map((cli) => ({ id: cli.value, label: cli.label }));

export const TALK_PLACES: TalkPlaceOption[] = [
  { id: "here", label: "In", choice: "In the project" },
  { id: "copy", label: "Duplicate", choice: "In a duplicate" },
  { id: "worktree", label: "Worktree", choice: "In a worktree" },
];

// `machines` names each paired computer by slug, so a project that lives on
// one reads apart from this computer's project of the same name.
export function talkProjects(projects: ProjectInfo[], machines: Record<string, string>): TalkProjectOption[] {
  return projects.map((p) => {
    const parent = findParentProject(p, projects);
    const machine = machines[peerSlugOf(p.name) ?? ""];
    const label = projectDisplayName(p, parent);
    return { name: p.name, label: machine ? `${label} on ${machine}` : label, parent: parent?.name ?? "" };
  });
}

export function talkAgentLabel(id: string): string {
  return TALK_AGENTS.find((a) => a.id === id)?.label ?? id;
}

export function talkProjectLabel(name: string, projects: TalkProjectOption[]): string {
  return projects.find((p) => p.name === name)?.label ?? name;
}

export function talkPlaceLabel(where: TalkPlace): string {
  return TALK_PLACES.find((p) => p.id === where)?.label ?? where;
}

export function talkPlanReady(plan: TalkPlan): boolean {
  return plan.project !== "" && plan.prompt.trim() !== "";
}

// The projects the owner picks from: the ones the sentence could have meant
// first, then every other in sidebar order.
export function talkProjectChoices(projects: TalkProjectOption[], candidates: string[]): TalkProjectOption[] {
  const first = candidates.flatMap((name) => projects.filter((p) => p.name === name));
  return [...first, ...projects.filter((p) => !candidates.includes(p.name))];
}

export function readTalkReply(raw: unknown): TalkReply {
  const r = (raw ?? {}) as Partial<{ ok: boolean; plan: TalkPlan; candidates: string[]; error: string; unsupported: boolean }>;
  if (r.ok && r.plan) return { ok: true, plan: r.plan, candidates: r.candidates ?? [] };
  return { ok: false, error: r.error || "Couldn't make a plan.", unsupported: r.unsupported === true };
}

// Runs an approved plan behind whatever is on screen: the copy is made as the
// Duplicate dialog makes one, then the agent starts in it with the prompt the
// way a phone's New Tab starts one. False when the copy couldn't be made, which
// bulkDuplicate has already said in its own toast.
export async function runTalkPlan(plan: TalkPlan): Promise<boolean> {
  let target = plan.project;
  if (plan.where !== "here") {
    const settings = useSettingsStore.getState();
    target = "";
    await useAppStore.getState().bulkDuplicate(plan.project, 1, {
      mode: plan.where,
      labels: [plan.label],
      excludeUncommitted: settings.duplicateExcludeUncommitted ?? false,
      reinstallDeps: settings.duplicateReinstallDeps ?? false,
      pullLatest: settings.duplicatePullLatest ?? true,
      keepSelection: true,
      onCreated: (name) => {
        target = name;
      },
    });
    if (!target) return false;
  }
  startPromptInNewTab(target, { agent: plan.agent }, plan.prompt, {});
  return true;
}
