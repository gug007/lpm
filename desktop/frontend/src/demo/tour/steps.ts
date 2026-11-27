import { providerMeta } from "../../agentStatus";
import { selectedProject } from "../commands/settings";
import { agentAction, project, queueFolder } from "../commands/state";
import type { AgentKind } from "../seed/types";
import { byLabel, find, findAll, nameOf, press, waitFor } from "./dom";
import type { TourAction } from "./protocol";

export interface StepContext {
  // The project the step acts on.
  project: string;
  click: (el: HTMLElement, button?: 0 | 2) => Promise<void>;
  type: (el: HTMLElement, text: string) => Promise<void>;
}

type Step<K extends TourAction["id"]> = (step: Extract<TourAction, { id: K }>, ctx: StepContext) => Promise<void>;
type Steps = { [K in TourAction["id"]]: Step<K> };

const FALLBACK_PROMPT = "Run the tests";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// An action button reads as its emoji, if any, then its label. The emoji can't
// be a word, or "Archive Codex" on another project's sidebar row would match.
const actionName = (label: string) => new RegExp(`^([^\\p{L}\\p{N}\\s]+\\s)?${escape(label)}$`, "u");

const button = (name: string | RegExp, root?: ParentNode) => waitFor(() => find("button, [role=button]", name, root));
const menuItem = (name: RegExp) =>
  waitFor(() => find("[role=menuitem], [role=menuitemcheckbox], [role=option], button", name, layer()));
const sidebar = () => find("aside") ?? document;

// What is on top: an open context menu, else the newest dialog.
function layer(): ParentNode {
  return findAll("[data-context-menu]").pop() ?? findAll("[role=dialog]").pop() ?? document;
}

// A dialog's confirm button: the last labelled one it lets you press, after
// Cancel and before any icon-only split arrow.
async function confirm(ctx: StepContext): Promise<void> {
  const dialog = await waitFor(() => findAll("[role=dialog]").pop());
  const pressable = (b: HTMLElement) => !(b as HTMLButtonElement).disabled && !!b.textContent?.trim();
  await ctx.click(await waitFor(() => findAll("button", undefined, dialog).filter(pressable).pop()));
}

// A row in the popover the button by that name opened: searched outward from
// the button, so it's found before anything else on screen with the same name.
// The button is looked up afresh, as the header re-renders under it.
function near(opener: string, label: string): HTMLElement | null {
  const from = find("button, [role=button]", opener);
  for (let box = from?.parentElement; box && box !== document.body; box = box.parentElement) {
    const hit = byLabel(label, box);
    if (hit && hit !== from) return hit;
  }
  return null;
}

async function openMenu(ctx: StepContext, name: string, row: string): Promise<void> {
  await ctx.click(await button(name));
  await ctx.click(await waitFor(() => near(name, row)));
}

// A profile row starts its profile only from its own Start button, which shows
// while the row is hovered. No synthetic event hovers it, so a transparent one counts.
function startButton(row: HTMLElement | null): HTMLElement | null {
  for (let box = row?.parentElement; box && box !== document.body; box = box.parentElement) {
    const hit = [...box.querySelectorAll("button")].find((b) => b !== row && nameOf(b) === "Start");
    if (hit) return hit;
  }
  return null;
}

async function openProject(ctx: StepContext, name: string): Promise<void> {
  if (!name || selectedProject() === name) return;
  await ctx.click(await waitFor(() => byLabel(name, sidebar())));
  await waitFor(() => selectedProject() === name);
}

// A step that works inside a project brings that project on screen first, in
// case the visitor has moved to another one since.
const inProject =
  <K extends TourAction["id"]>(act: Step<K>): Step<K> =>
  async (step, ctx) => {
    await openProject(ctx, ctx.project);
    await act(step, ctx);
  };

function composer(): HTMLElement | null {
  return findAll('[contenteditable="true"]').pop() ?? null;
}

async function send(ctx: StepContext, text: string): Promise<void> {
  const field = await waitFor(composer);
  await ctx.click(field);
  await ctx.type(field, text);
  press(field, "Enter");
}

// The project's own agent button, or, in a project without one, a new
// terminal with the CLI typed into it.
async function openAgent(ctx: StepContext, kind: AgentKind): Promise<void> {
  const action = agentAction(project(ctx.project), kind);
  if (action) return ctx.click(await button(actionName(action.label)));
  await ctx.click(await button("New terminal"));
  await send(ctx, kind);
}

const prompt = (ctx: StepContext, kind: AgentKind) =>
  send(ctx, agentAction(project(ctx.project), kind)?.task?.prompt ?? FALLBACK_PROMPT);

// A project's agent row, by the title the sidebar gives it.
const agentRow = (projectName: string, kind: AgentKind) =>
  find("button", new RegExp(`— ${escape(providerMeta(kind).label)} in ${escape(projectName)}$`), sidebar());

export const STEPS: Steps = {
  addProject: async (step, ctx) => {
    if (step.folder) queueFolder(step.folder);
    await ctx.click(await button("Add project"));
    await ctx.click(await menuItem(/^Local folder/));
  },
  addSshHost: async (step, ctx) => {
    await ctx.click(await button("Add project"));
    await ctx.click(await menuItem(/^Server/));
    await ctx.click(await menuItem(/^Just SSH in/));
    await ctx.click(await button(/^Select a host/, layer()));
    await ctx.click(await button(new RegExp(`^${escape(step.host)}( —|$)`), layer()));
    await confirm(ctx);
  },
  start: inProject(async (_step, ctx) => ctx.click(await button("Start"))),
  agent: inProject((_step, ctx) => openAgent(ctx, "claude")),
  prompt: inProject((_step, ctx) => prompt(ctx, "claude")),
  codex: inProject((_step, ctx) => openAgent(ctx, "codex")),
  codexPrompt: inProject((_step, ctx) => prompt(ctx, "codex")),
  openProject: (step, ctx) => openProject(ctx, step.project),
  openAgent: async (step, ctx) => {
    await openProject(ctx, step.project);
    await ctx.click(await waitFor(() => agentRow(step.project, step.agent)));
  },
  answer: async (step, ctx) => {
    await STEPS.openAgent({ id: "openAgent", project: step.project, agent: step.agent }, ctx);
    await send(ctx, step.text);
  },
  startProfile: inProject(async (step, ctx) => {
    await ctx.click(await button("Services and profiles"));
    await ctx.click(await waitFor(() => startButton(near("Services and profiles", step.profile))));
  }),
  toggleService: inProject(async (step, ctx) => {
    if ((project(ctx.project)?.running.has(step.service) ?? false) === step.on) return;
    await openMenu(ctx, "Services and profiles", step.service);
  }),
  restartService: inProject(async (step, ctx) => {
    await ctx.click(await waitFor(() => byLabel(step.service)), 2);
    await ctx.click(await menuItem(/^Restart service/));
  }),
  serviceTab: inProject(async (step, ctx) => ctx.click(await waitFor(() => byLabel(step.service)))),
  preview: async () => undefined,
  shell: inProject(async (step, ctx) => {
    await ctx.click(await button("New terminal"));
    await send(ctx, step.command);
  }),
  review: inProject(async (_step, ctx) => {
    await ctx.click(await button("More options"));
    await ctx.click(await menuItem(/^Review changes/));
  }),
  commit: inProject(async (_step, ctx) => {
    await ctx.click(await button("Commit changes"));
    const message = await waitFor(() => find("textarea", undefined, layer()));
    await ctx.type(message, agentAction(project(ctx.project), "claude")?.task?.prompt ?? "Update files");
    await confirm(ctx);
  }),
  checkout: inProject((step, ctx) => openMenu(ctx, "Switch branch", step.branch)),
  runAction: inProject(async (step, ctx) => {
    const action = project(ctx.project)?.actions.find((a) => a.name === step.action);
    await ctx.click(await button(actionName(action?.label ?? step.action)));
    if (action?.confirm) await confirm(ctx);
    // Its result card reports back, then closes the way a person would close it.
    const card = await waitFor(() => find('[data-action-run-card]:not([data-run-state="running"])'), 8000);
    await ctx.click(await waitFor(() => find("button", "Close", card)));
  }),
  copy: async (step, ctx) => {
    await ctx.click(await waitFor(() => byLabel(step.project, sidebar())), 2);
    await ctx.click(await menuItem(step.mode === "worktree" ? /^New worktree/ : /^Duplicate/));
    await confirm(ctx);
  },
};
