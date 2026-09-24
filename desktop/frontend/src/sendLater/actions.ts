import { toast } from "sonner";
import { useAppStore } from "../store/app";
import { deliverPromptDraft } from "../store/composerDrafts";
import {
  rememberEditedTime,
  removePrompt,
  schedulePrompt,
  sendPromptNow,
  type ScheduledPrompt,
} from "../store/sendLater";
import { useTerminalTargets } from "../store/terminalTargets";
import { keepAsDraft } from "./closeout";
import { promptPreview } from "./preview";

// What a mounted composer lends to the actions below: putting a prompt back in
// its input, and opening its Send later picker for a prompt already scheduled.
export interface ComposerSendLaterHost {
  restore: (text: string, images: Record<string, string>) => void;
  openPicker: (item: ScheduledPrompt) => void;
}

const hosts = new Map<string, ComposerSendLaterHost>();

export function registerComposerHost(historyKey: string, host: ComposerSendLaterHost): () => void {
  hosts.set(historyKey, host);
  return () => {
    if (hosts.get(historyKey) === host) hosts.delete(historyKey);
  };
}

function liveTarget(item: ScheduledPrompt) {
  return (
    useTerminalTargets
      .getState()
      .byProject[item.projectName]?.find((t) => t.historyKey === item.historyKey) ?? null
  );
}

// Where a prompt taken off the schedule goes back to: the terminal's own input
// when it is on screen, else parked in that terminal's input and brought into
// view. False when its terminal isn't open in this window at all.
function canPutBack(item: ScheduledPrompt): boolean {
  return hosts.has(item.historyKey) || liveTarget(item) !== null;
}

function putBack(item: ScheduledPrompt): void {
  const host = hosts.get(item.historyKey);
  if (host) {
    host.restore(item.text, item.images);
    return;
  }
  const target = liveTarget(item);
  if (!target) return;
  deliverPromptDraft(target.id, item.historyKey, item.text, item.images);
  useAppStore.getState().focusProjectTerminal(item.projectName, target.id);
}

// With nowhere to put it back, the prompt goes to the drafts instead.
async function toDrafts(item: ScheduledPrompt): Promise<void> {
  try {
    await keepAsDraft(item);
    toast("Kept as a draft", {
      description: "Its terminal isn't open here, so the prompt is in History › Drafts.",
    });
  } catch (err) {
    toast.error(`Couldn't keep it as a draft: ${String(err)}`);
  }
}

export function sendScheduledNow(item: ScheduledPrompt): void {
  sendPromptNow(item.id).catch((err) => toast.error(`Couldn't send it: ${String(err)}`));
}

// Take a prompt off the schedule into the input to change it. The time is kept,
// so Send later opens on it again.
export async function editScheduled(item: ScheduledPrompt): Promise<void> {
  if (!canPutBack(item)) return toDrafts(item);
  const removed = await removePrompt(item.id).catch(() => null);
  if (!removed) return;
  rememberEditedTime(removed.historyKey, removed.dueAt);
  putBack(removed);
}

export async function cancelScheduled(item: ScheduledPrompt): Promise<void> {
  const removed = await removePrompt(item.id).catch(() => null);
  if (!removed) return;
  toast("Scheduled prompt canceled", {
    description: `“${promptPreview(removed.text, 60)}”`,
    action: {
      label: "Undo",
      onClick: () => {
        void schedulePrompt({
          projectName: removed.projectName,
          historyKey: removed.historyKey,
          terminalLabel: removed.terminalLabel,
          text: removed.text,
          images: removed.images,
          dueAt: Math.max(removed.dueAt, Date.now() + 60_000),
          kind: removed.kind,
        });
      },
    },
  });
}

export async function keepScheduledAsDraft(item: ScheduledPrompt): Promise<void> {
  try {
    await keepAsDraft(item);
    toast.success("Kept as a draft", { description: "Find it in History › Drafts." });
  } catch (err) {
    toast.error(`Couldn't keep it as a draft: ${String(err)}`);
  }
}

// Undo right after scheduling: off the schedule and back into the input.
export async function unschedule(item: ScheduledPrompt): Promise<void> {
  if (!canPutBack(item)) return toDrafts(item);
  const removed = await removePrompt(item.id).catch(() => null);
  if (removed) putBack(removed);
}

// Pick a new time for a waiting prompt, in the picker of the input it was
// chosen from (the History popover's composer), else the prompt's own.
export function newTimeFor(item: ScheduledPrompt, fromHistoryKey?: string): void {
  const host = (fromHistoryKey && hosts.get(fromHistoryKey)) || hosts.get(item.historyKey);
  if (host) host.openPicker(item);
}
