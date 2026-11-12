import { toast } from "../notifications/toast";
import { NotifyUnattended } from "../../bridge/commands";
import { useAppStore } from "../store/app";
import { isWhenDone, type ScheduledPrompt } from "../store/sendLater";
import type { TerminalTargetInfo } from "../store/terminalTargets";
import { GLOBAL_TERMINALS_KEY } from "../terminals";
import { promptPreview } from "./preview";
import { promptNoun } from "./status";
import { whenLabel } from "./time";
import { MACHINE } from "../machineWords";

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
    event: "sendLater",
    action: {
      label: "Open",
      onClick: () => useAppStore.getState().focusProjectTerminal(item.projectName, target.id),
    },
  });
  void NotifyUnattended(`Sent to ${label} · ${projectTitle(item.projectName)}`, preview, "sendLater").catch(() => {});
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
  const asleep = `the ${MACHINE.noun} was asleep`;
  const away = atLaunch ? `lpm wasn't running or ${asleep}` : asleep;
  let title: string;
  let description: string;
  if (fresh.length === 1) {
    const item = fresh[0];
    const where = `${item.terminalLabel || "its terminal"} · ${projectTitle(item.projectName)}`;
    const hold = "It's on hold in that terminal's prompt box and in History › Scheduled.";
    title = `A ${promptNoun(item).toLowerCase()} prompt wasn't sent`;
    description = isWhenDone(item)
      ? `“${promptPreview(item.text, 60)}” was waiting for ${where} to finish when lpm closed. ${hold}`
      : `“${promptPreview(item.text, 60)}” was due ${whenLabel(item.dueAt, Date.now())} in ${where}, while ${away}. ${hold}`;
  } else {
    title = `${fresh.length} scheduled prompts weren't sent`;
    description = `They came due while ${away}. Each is on hold in its terminal's prompt box and in History › Scheduled.`;
  }
  toast.warning(title, { description, duration: 10_000, event: "sendLater" });
  void NotifyUnattended(title, description, "sendLater").catch(() => {});
}
