import { Lock } from "lucide-react";
import {
  EARLIER_PUSH,
  WAITING_PUSH,
} from "@/components/home/paired-devices-data";
import { PushCard } from "@/components/home/paired-devices-push";

type Props = {
  notified: boolean;
  pressed: boolean;
};

// The lock screen the phone sits on until a waiting agent sends a push; the
// tap on it opens that exact terminal.
export function PhoneLock({ notified, pressed }: Props) {
  return (
    <div className="flex flex-1 flex-col bg-[radial-gradient(120%_80%_at_50%_0%,#1f2937_0%,#111113_60%)] px-2.5 pb-5">
      <div className="mt-10 flex flex-col items-center text-gray-100">
        <Lock className="h-3 w-3 text-gray-300" strokeWidth={2.5} />
        <span className="mt-2 text-[10px] font-medium text-gray-300">
          Tuesday, June 9
        </span>
        <span className="text-[3.25rem] font-semibold leading-none tracking-tight tabular-nums">
          9:41
        </span>
      </div>
      <div className="mt-auto flex flex-col gap-1.5">
        <PushCard
          push={WAITING_PUSH}
          className={`${
            notified ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          } ${pressed ? "scale-[0.96] bg-white/[0.2]" : "bg-white/[0.13]"}`}
        />
        <PushCard push={EARLIER_PUSH} className="bg-white/[0.08] opacity-70" />
      </div>
    </div>
  );
}
