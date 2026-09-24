import { toast } from "sonner";
import { NotifyUnattended } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import type { ScheduledPrompt } from "../store/sendLater";
import type { TerminalTargetInfo } from "../store/terminalTargets";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { promptPreview } from "./preview";
import { whenLabel } from "./time";

function projectTitle(projectName: string): string {
  if (projectName === GLOBAL_TERMINALS_KEY) return "Terminals";
  const project = useAppStore.getState().projects.find((p) => p.name === projectName);
  return project?.label || projectName;
}

export function announceSent(item: ScheduledPrompt, target: TerminalTargetInfo): void {
  const label = target.label || item.terminalLabel || "the terminal";
  const preview = promptPreview(item.text);
  toast.success(`Sent to ${label}`, {
    description: preview,
    action: {
      label: "Open",
      onClick: () => useAppStore.getState().focusProjectTerminal(item.projectName, target.id),
    },
  });
  void NotifyUnattended(`Sent to ${label} · ${projectTitle(item.projectName)}`, preview).catch(() => {});
}

// Missed prompts already told about, so one left alone isn't announced again on
// every launch.
const ANNOUNCED_KEY = "lpm:send-later:announced-missed:v1";

function loadAnnounced(): Set<string> {
  try {
    const ids = JSON.parse(window.localStorage.getItem(ANNOUNCED_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function saveAnnounced(ids: Set<string>): void {
  try {
    window.localStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...ids]));
  } catch {
    /* a convenience only */
  }
}

// Tell the user about prompts that missed their time and weren't mentioned yet.
// `atLaunch`: they were found missed when lpm started, so it may have been
// closed then rather than the Mac asleep.
export function announceMissed(items: ScheduledPrompt[], atLaunch: boolean): void {
  const missed = items.filter((i) => i.state === "missed");
  const announced = loadAnnounced();
  const fresh = missed.filter((i) => !announced.has(i.id));
  saveAnnounced(new Set(missed.map((i) => i.id)));
  if (fresh.length === 0) return;
  const away = atLaunch ? "lpm wasn't running or the Mac was asleep" : "the Mac was asleep";
  let title: string;
  let description: string;
  if (fresh.length === 1) {
    const item = fresh[0];
    title = "A scheduled prompt wasn't sent";
    description = `“${promptPreview(item.text, 60)}” was due ${whenLabel(item.dueAt, Date.now())} in ${
      item.terminalLabel || "its terminal"
    } · ${projectTitle(item.projectName)}, while ${away}. It's on hold in that terminal's prompt box and in History › Scheduled.`;
  } else {
    title = `${fresh.length} scheduled prompts weren't sent`;
    description = `They came due while ${away}. Each is on hold in its terminal's prompt box and in History › Scheduled.`;
  }
  toast.warning(title, { description, duration: 10_000 });
  void NotifyUnattended(title, description).catch(() => {});
}
