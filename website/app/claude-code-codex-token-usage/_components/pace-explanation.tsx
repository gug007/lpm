import { ArrowRight } from "lucide-react";
import { explainPace, type Pace } from "./pace-model";
import { TEXT_LINK } from "./page-styles";
import { trackOnce } from "./track-once";

export default function PaceExplanation({ pace, used }: { pace: Pace; used: number }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <p>{explainPace(pace, used)}</p>
      {pace.verdict === "over" && (
        <p>In lpm, hover the usage meter in the sidebar to see this card while you work.</p>
      )}
      {pace.verdict === "exhausted" && (
        <p>
          <a
            href="#limit-reached"
            onClick={() => trackOnce("pace-reset-link")}
            className={TEXT_LINK}
          >
            Queue your next prompt for the reset
            <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px]" aria-hidden />
          </a>
        </p>
      )}
    </div>
  );
}
