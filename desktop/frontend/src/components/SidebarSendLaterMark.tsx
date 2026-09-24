import { AlarmClock, AlarmClockOff, Hourglass } from "lucide-react";
import { markKey, parseMarkKey } from "../sendLater/summary";
import { TONE_TEXT } from "../sendLater/toneStyles";
import { useSendLater } from "../store/sendLater";

// A small clock beside a project's name while any of its terminals has prompts
// waiting to be sent: an hourglass when one is due and waiting for its agent.
export function SidebarSendLaterMark({ projectName }: { projectName: string }) {
  const key = useSendLater((s) => markKey(s.items, (i) => i.projectName === projectName));
  const mark = parseMarkKey(key);
  if (!mark) return null;
  const pending = mark.scheduled + mark.waiting;
  const what = [
    pending > 0 && (pending === 1 ? "1 prompt scheduled to send" : `${pending} prompts scheduled to send`),
    mark.missed > 0 && `${mark.missed} missed ${mark.missed === 1 ? "its" : "their"} time`,
  ]
    .filter(Boolean)
    .join(", ");
  const [Icon, tone] =
    mark.waiting > 0
      ? [Hourglass, TONE_TEXT.waiting]
      : mark.scheduled > 0
        ? [AlarmClock, TONE_TEXT.scheduled]
        : [AlarmClockOff, TONE_TEXT.missed];
  return (
    <span title={what} aria-label={what} className={`flex shrink-0 items-center ${tone}`}>
      <Icon size={11} strokeWidth={1.75} />
    </span>
  );
}
