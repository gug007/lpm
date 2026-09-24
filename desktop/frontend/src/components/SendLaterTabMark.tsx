import { AlarmClock, AlarmClockOff, Hourglass } from "lucide-react";
import { markKey, parseMarkKey } from "../sendLater/summary";
import { TONE_TEXT } from "../sendLater/toneStyles";
import { useSendLater } from "../store/sendLater";

// Marks on a terminal tab while prompts wait to go into it: a clock and how many
// are scheduled, an hourglass for one that's due and waiting for the agent, and
// a crossed-out clock for one that missed its time.
export function SendLaterTabMark({ historyKey }: { historyKey: string | undefined }) {
  const key = useSendLater((s) => (historyKey ? markKey(s.items, (i) => i.historyKey === historyKey) : ""));
  const mark = parseMarkKey(key);
  if (!mark) return null;
  const parts = [
    mark.waiting > 0 && `${mark.waiting} due, waiting to go out`,
    mark.missed > 0 && `${mark.missed} missed ${mark.missed === 1 ? "its" : "their"} time`,
    mark.scheduled > 0 && `${mark.scheduled} scheduled`,
  ].filter(Boolean);
  const what = `Send later: ${parts.join(", ")}`;
  return (
    <span title={what} aria-label={what} className="ml-1 flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
      {mark.waiting > 0 && (
        <span className={TONE_TEXT.waiting}>
          <Hourglass size={11} strokeWidth={1.75} />
        </span>
      )}
      {mark.missed > 0 && (
        <span className={TONE_TEXT.missed}>
          <AlarmClockOff size={11} strokeWidth={1.75} />
        </span>
      )}
      {mark.scheduled > 0 && (
        <span className={`flex items-center gap-0.5 ${TONE_TEXT.scheduled}`}>
          <AlarmClock size={11} strokeWidth={1.75} />
          {mark.scheduled > 1 && mark.scheduled}
        </span>
      )}
    </span>
  );
}
