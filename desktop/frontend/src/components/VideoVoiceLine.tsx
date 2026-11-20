import { Cloud, Laptop } from "lucide-react";
import { openVideoSettings } from "../store/videoSettings";
import { useVideoVoice, videoVoiceSummary } from "../videoVoice";
import { AnswerCardFoot } from "./AnswerCardFoot";

// The foot of the Video button's hover card: who will voice the answer, what
// that costs, and the Video settings window to change it.
export function VideoVoiceLine() {
  const voice = useVideoVoice();
  const { name, where, cost } = videoVoiceSummary(voice);
  const Icon = voice.narrator === "openai" ? Cloud : Laptop;

  return (
    <AnswerCardFoot
      icon={
        <Icon
          aria-hidden
          size={13}
          className={`shrink-0 ${voice.narrator === "openai" ? "text-[var(--accent-violet)]" : "text-[var(--accent-green)]"}`}
        />
      }
      onSettings={openVideoSettings}
    >
      <span className="text-[var(--text-primary)]">{name}</span> · {where} · {cost}
    </AnswerCardFoot>
  );
}
