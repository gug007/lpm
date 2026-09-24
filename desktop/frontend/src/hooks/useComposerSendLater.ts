import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { registerComposerHost, unschedule } from "../sendLater/actions";
import { choiceAt, loadLastChoice, saveLastChoice, type LastChoice } from "../sendLater/lastChoice";
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
}

// The picker is open for the prompt in the input, or to move a waiting one.
export type SendLaterPicker =
  | { mode: "new"; initialAt: number; lastUsedAt: number }
  | { mode: "reschedule"; item: ScheduledPrompt; initialAt: number; lastUsedAt: number };

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
}: Options) {
  const [picker, setPicker] = useState<SendLaterPicker | null>(null);
  const restoreRef = useRef(restore);
  restoreRef.current = restore;

  const openForPrompt = useCallback(() => {
    if (!readPrompt()) return;
    const now = Date.now();
    const lastUsedAt = choiceAt(loadLastChoice(), now);
    const edited = takeEditedTime(historyKey);
    setPicker({ mode: "new", initialAt: edited && edited > now ? edited : lastUsedAt, lastUsedAt });
  }, [readPrompt, historyKey]);

  const openForItem = useCallback((item: ScheduledPrompt) => {
    const now = Date.now();
    const lastUsedAt = choiceAt(loadLastChoice(), now);
    setPicker({ mode: "reschedule", item, initialAt: item.dueAt > now ? item.dueAt : lastUsedAt, lastUsedAt });
  }, []);

  useEffect(
    () =>
      registerComposerHost(historyKey, {
        restore: (text, images) => restoreRef.current(text, images),
        openPicker: openForItem,
      }),
    [historyKey, openForItem],
  );

  const close = useCallback(() => setPicker(null), []);

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
      const prompt = readPrompt();
      if (!prompt || !claim(prompt.id)) return;
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
        setPicker(null);
        toast.success(`Scheduled for ${shortWhenLabel(at, Date.now())}`, {
          action: { label: "Undo", onClick: () => void unschedule(item) },
        });
      } catch (err) {
        toast.error(`Couldn't schedule it: ${String(err)}`);
      } finally {
        release(prompt.id);
      }
    },
    [picker, readPrompt, claim, release, retire, projectName, historyKey, targetLabel, agent],
  );

  return { picker, openForPrompt, openForItem, close, pick };
}
