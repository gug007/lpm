import { Send, Sparkles } from "lucide-react";
import { TalkPlanRow } from "./TalkPlanRow";

const BAR = "block h-2.5 max-w-full rounded-full bg-[var(--bg-active)] motion-safe:animate-pulse";

// The plan's rows before there is a plan, each where it will fill in.
export function TalkPlanSkeleton() {
  return (
    <ol aria-hidden className="flex flex-col">
      <TalkPlanRow icon={null} status="idle" last={false} title={<span className={`${BAR} w-12`} />}>
        <span className={`${BAR} w-24`} />
      </TalkPlanRow>
      <TalkPlanRow icon={<Sparkles size={14} className="opacity-40" />} status="idle" last={false} title="Start">
        <span className={`${BAR} w-32`} />
      </TalkPlanRow>
      <TalkPlanRow icon={<Send size={14} className="opacity-40" />} status="idle" last title="Send">
        <span className={`${BAR} w-64`} />
      </TalkPlanRow>
    </ol>
  );
}
