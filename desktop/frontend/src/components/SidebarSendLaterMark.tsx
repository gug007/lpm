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
  const total = mark.scheduled + mark.waiting + mark.missed;
  const what = total === 1 ? "1 prompt waiting to be sent" : `${total} prompts waiting to be sent`;
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
