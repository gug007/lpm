import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "../notifications/toast";
import { registerComposerHost, unschedule } from "../sendLater/actions";
import { choiceAt, DEFAULT_CHOICE, loadLastChoice, saveLastChoice, type LastChoice } from "../sendLater/lastChoice";
import { whenDoneSubject } from "../sendLater/status";
import { shortWhenLabel } from "../sendLater/time";
import {
  reschedulePrompt,
  schedulePrompt,
  takeEditedTime,
  type ScheduledPrompt,
  type ScheduledPromptKind,
} from "../store/sendLater";

export interface ComposerPrompt {
  id: string;
  text: string;
  images: Record<string, string>;
}

interface Options {
  projectName: string;
  historyKey: string;
  targetLabel: string;
  // The agent running in the terminal, empty for a plain shell.
  agent: string;
  // The prompt in the input, or null when there's nothing to send.
  readPrompt: () => ComposerPrompt | null;
  // Guard against a second send, save or schedule of the same prompt at once.
  claim: (id: string) => boolean;
  release: (id: string) => void;
  // Clear the prompt from the input the way a send does.
  retire: (id: string) => void;
  // Put a prompt back into the input.
  restore: (text: string, images: Record<string, string>) => void;
  // Whether the input is on screen.
  shown: boolean;
}

// The picker is open for the prompt in the input, or to move a waiting one.
export type SendLaterPicker =
  | { mode: "new"; initialAt: number; lastUsedAt: number | null }
  | { mode: "reschedule"; item: ScheduledPrompt; initialAt: number; lastUsedAt: number | null };

// The picker opens on the time last picked, or the default one; only a real
// past pick is marked "last used".
function rememberedTimes(now: number): { lastUsedAt: number | null; suggestedAt: number } {
  const last = loadLastChoice();
  return { lastUsedAt: last && choiceAt(last, now), suggestedAt: choiceAt(last ?? DEFAULT_CHOICE, now) };
}

export function useComposerSendLater({
  projectName,
  historyKey,
  targetLabel,
  agent,
  readPrompt,
  claim,
  release,
  retire,
  restore,
  shown,
}: Options) {
  const [picker, setPicker] = useState<SendLaterPicker | null>(null);
  // History › Drafts, asked for by a Saved to Drafts toast. Asked for while
  // the input is off screen, it opens once the input is back.
  const [draftsOpen, setDraftsOpen] = useState(false);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const openForPrompt = useCallback(() => {
    if (!readPrompt()) return;
    const now = Date.now();
    const { lastUsedAt, suggestedAt } = rememberedTimes(now);
    const edited = takeEditedTime(historyKey);
    setPicker({ mode: "new", initialAt: edited && edited > now ? edited : suggestedAt, lastUsedAt });
  }, [readPrompt, historyKey]);

  const openForItem = useCallback((item: ScheduledPrompt) => {
    const now = Date.now();
    const { lastUsedAt, suggestedAt } = rememberedTimes(now);
    setPicker({ mode: "reschedule", item, initialAt: item.dueAt > now ? item.dueAt : suggestedAt, lastUsedAt });
  }, []);

  useEffect(
    () =>
      registerComposerHost(historyKey, {
        restore: (text, images) => restoreRef.current(text, images),
        openPicker: openForItem,
        openDrafts: () => {
          setDraftsOpen(true);
          return shownRef.current;
        },
      }),
    [historyKey, openForItem],
  );

  const close = useCallback(() => setPicker(null), []);
  const closeDrafts = useCallback(() => setDraftsOpen(false), []);

  // Take the prompt in the input onto the schedule, with Undo on the toast that
  // says so. True once it's there.
  const scheduleInput = useCallback(
    async (at: number, kind: ScheduledPromptKind, done: string, failed: string): Promise<boolean> => {
      const prompt = readPrompt();
      if (!prompt || !claim(prompt.id)) return false;
      try {
        const item = await schedulePrompt({
          projectName,
          historyKey,
          terminalLabel: targetLabel,
          agent,
          text: prompt.text,
          images: prompt.images,
          dueAt: at,
          kind,
        });
        retire(prompt.id);
        toast.success(done, { action: { label: "Undo", onClick: () => void unschedule(item) } });
        return true;
      } catch (err) {
        toast.error(`${failed}: ${String(err)}`);
        return false;
      } finally {
        release(prompt.id);
      }
    },
    [readPrompt, claim, release, retire, projectName, historyKey, targetLabel, agent],
  );

  const pick = useCallback(
    async (at: number, kind: ScheduledPromptKind, choice: LastChoice | null) => {
      const current = picker;
      if (!current) return;
      if (choice) saveLastChoice(choice);
      if (current.mode === "reschedule") {
        setPicker(null);
        try {
          await reschedulePrompt(current.item.id, at, kind);
          toast.success(`Rescheduled for ${shortWhenLabel(at, Date.now())}`);
        } catch (err) {
          toast.error(`Couldn't reschedule it: ${String(err)}`);
        }
        return;
      }
      if (await scheduleInput(at, kind, `Scheduled for ${shortWhenLabel(at, Date.now())}`, "Couldn't schedule it")) {
        setPicker(null);
      }
    },
    [picker, scheduleInput],
  );

  // Queue the prompt to go out once the agent (or a shell's command) finishes:
  // due at once, held by the sender while the terminal is busy.
  const subject = whenDoneSubject(agent, targetLabel);
  const sendWhenDone = useCallback(
    () => scheduleInput(Date.now(), "done", `Sends when ${subject} finishes`, "Couldn't queue it"),
    [scheduleInput, subject],
  );

  return {
    picker,
    openForPrompt,
    openForItem,
    close,
    pick,
    sendWhenDone,
    whenDoneHint: `Waits for ${subject} to finish, then sends`,
    draftsOpen: draftsOpen && shown,
    closeDrafts,
  };
}
