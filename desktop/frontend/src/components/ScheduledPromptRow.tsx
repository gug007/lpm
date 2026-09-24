import { ImageIcon } from "lucide-react";
import {
  cancelScheduled,
  editScheduled,
  keepScheduledAsDraft,
  newTimeFor,
  sendScheduledNow,
} from "../sendLater/actions";
import { promptPreview } from "../sendLater/preview";
import { promptStatus } from "../sendLater/status";
import { TONE_TEXT } from "../sendLater/toneStyles";
import type { ScheduledPrompt, SendLaterHold } from "../store/sendLater";

interface ScheduledPromptRowProps {
  item: ScheduledPrompt;
  hold: SendLaterHold | undefined;
  now: number;
  fromHistoryKey: string;
  // Leaves History for the input: after Edit or New time.
  onLeave: () => void;
}

const ACTION_CLASS =
  "h-6 rounded-md px-2 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--text-primary)]";

export function ScheduledPromptRow({ item, hold, now, fromHistoryKey, onLeave }: ScheduledPromptRowProps) {
  const status = promptStatus(item, hold, now);
  const images = Object.keys(item.images).length;
  const leaveThen = (run: () => unknown) => () => {
    onLeave();
    void run();
  };
  return (
    <div className="group flex flex-col gap-1 rounded-lg px-2.5 py-2 hover:bg-[var(--bg-hover)]">
      <div className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--text-primary)]">
          {promptPreview(item.text, 200)}
        </span>
        {images > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
            <ImageIcon size={11} strokeWidth={1.75} />
            {images}
          </span>
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <span className={`min-w-0 truncate text-[11px] ${TONE_TEXT[status.tone]}`}>
          {status.title}
          {status.detail && <span className="text-[var(--text-muted)]"> · {status.detail}</span>}
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => sendScheduledNow(item)}
            className={`${ACTION_CLASS} font-medium text-[var(--accent-blue-text)]`}
          >
            Send now
          </button>
          {item.state === "missed" ? (
            <>
              <button type="button" onClick={leaveThen(() => newTimeFor(item, fromHistoryKey))} className={ACTION_CLASS}>
                New time
              </button>
              <button type="button" onClick={() => void keepScheduledAsDraft(item)} className={ACTION_CLASS}>
                Keep as draft
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={leaveThen(() => editScheduled(item))} className={ACTION_CLASS}>
                Edit
              </button>
              <button type="button" onClick={() => void cancelScheduled(item)} className={ACTION_CLASS}>
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
