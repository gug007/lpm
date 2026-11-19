import { TakeOpenLink } from "../bridge/commands";
import { copyText } from "./components/files/fileActions";
import { EventsOn } from "../bridge/runtime";
import { toast } from "./notifications/toast";
import { useAppStore } from "./store/app";
import { seedLaunchpad } from "./store/launchpadSeed";
import { useTerminalTargets } from "./store/terminalTargets";

// What an `lpm://` link asks for, as openlink.rs parses it.
export interface OpenLink {
  kind: "open" | "new";
  project: string;
  // The tab's persisted key: its live id changes with every launch.
  tab?: string;
  agent?: string;
  prompt?: string;
}

// Long enough for a project that wasn't open yet to bring its tabs back.
const TAB_WAIT_MS = 15_000;

export function projectLink(projectName: string): string {
  return `lpm://open?project=${encodeURIComponent(projectName)}`;
}

export function tabLink(projectName: string, historyKey: string): string {
  return `${projectLink(projectName)}&tab=${encodeURIComponent(historyKey)}`;
}

export function copyLink(link: string): Promise<void> {
  return copyText(link, "Link copied");
}

function tabOf(projectName: string, historyKey: string) {
  return useTerminalTargets.getState().byProject[projectName]?.find((t) => t.historyKey === historyKey);
}

// A project that wasn't open this session has no tabs to show until it opens:
// the link waits for its tab to come back, and says so if it never does.
function openTab(projectName: string, label: string, historyKey: string): void {
  const app = useAppStore.getState();
  const now = tabOf(projectName, historyKey);
  if (now) {
    app.focusProjectTerminal(projectName, now.id);
    return;
  }
  app.selectProject(projectName);
  let done = false;
  const finish = () => {
    done = true;
    unsubscribe();
    window.clearTimeout(timer);
  };
  const unsubscribe = useTerminalTargets.subscribe(() => {
    const tab = done ? undefined : tabOf(projectName, historyKey);
    if (!tab) return;
    finish();
    useAppStore.getState().focusProjectTerminal(projectName, tab.id);
  });
  const timer = window.setTimeout(() => {
    if (done) return;
    finish();
    toast(`That tab is closed, so ${label} opened without it.`);
  }, TAB_WAIT_MS);
}

export function openLink(link: OpenLink): void {
  const app = useAppStore.getState();
  const project = app.projects.find((p) => p.name === link.project);
  if (!project) {
    toast.error(`No project named “${link.project}” in lpm.`);
    return;
  }
  const label = project.label || project.name;
  if (link.kind === "new") {
    app.selectProject(project.name);
    seedLaunchpad(project.name, link.agent ?? "", link.prompt ?? "");
    return;
  }
  if (link.tab) openTab(project.name, label, link.tab);
  else app.selectProject(project.name);
}

async function takeWaiting(): Promise<void> {
  try {
    const link = (await TakeOpenLink()) as OpenLink | null;
    if (link) openLink(link);
  } catch {
    /* an older backend has no links to hand over */
  }
}

// Main window only: it is the one that shows projects. A link that launched
// lpm is already waiting by the time this runs.
export function startOpenLinks(): () => void {
  void takeWaiting();
  return EventsOn("open-link", () => void takeWaiting());
}
