import { toast } from "sonner";
import { saveDraft } from "../store/messageHistory";
import { removePrompt, useSendLater, type ScheduledPrompt } from "../store/sendLater";
import { promptPreview } from "./preview";

// Only the window that sends prompts files a closed terminal's prompts away;
// another window doing it too would file each one twice.
let enabled = false;

export function enableCloseout(): () => void {
  enabled = true;
  return () => {
    enabled = false;
  };
}

function saveAsDraft(item: ScheduledPrompt): Promise<void> {
  return saveDraft({
    text: item.text,
    projectName: item.projectName,
    terminalId: item.historyKey,
    terminalLabel: item.terminalLabel,
    images: item.images,
  });
}

// File a waiting prompt with the user's drafts, text and images intact, and
// take it off the schedule. The draft is written first, so a failure keeps it
// scheduled rather than losing it.
export async function keepAsDraft(item: ScheduledPrompt): Promise<void> {
  await saveAsDraft(item);
  await removePrompt(item.id);
}

async function keepAllAsDrafts(items: ScheduledPrompt[], title: string) {
  let kept = 0;
  for (const item of items) {
    try {
      await keepAsDraft(item);
      kept++;
    } catch {
      /* stays scheduled, visible where it was */
    }
  }
  if (kept === 0) return;
  toast(title, {
    description:
      kept === 1
        ? `“${promptPreview(items[0].text, 60)}” was kept as a draft in History.`
        : `${kept} scheduled prompts were kept as drafts in History.`,
    duration: 8_000,
  });
}

// A closed terminal can't take its waiting prompts any more.
export function onTerminalsClosed(projectName: string, historyKeys: (string | undefined)[]): void {
  if (!enabled) return;
  const keys = new Set(historyKeys.filter((k): k is string => !!k));
  const doomed = useSendLater
    .getState()
    .items.filter((i) => i.projectName === projectName && keys.has(i.historyKey));
  if (doomed.length === 0) return;
  const label = doomed[0].terminalLabel || "Terminal";
  void keepAllAsDrafts(doomed, `${label} tab closed`);
}

export function onProjectsRemoved(names: string[]): void {
  if (!enabled) return;
  const gone = new Set(names);
  const doomed = useSendLater.getState().items.filter((i) => gone.has(i.projectName));
  if (doomed.length === 0) return;
  void keepAllAsDrafts(doomed, "Project removed");
}
