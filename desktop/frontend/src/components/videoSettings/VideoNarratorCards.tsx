import type { KeyboardEvent } from "react";
import { ArrowUpRight, Check, Cloud, Download, Globe, KeyRound, Languages, Laptop, ShieldCheck } from "lucide-react";
import type { VideoNarrator } from "../../store/settings";
import { CLOUD_PER_MINUTE } from "../../videoVoice";
import { VideoNarratorCard, type NarratorFact } from "./VideoNarratorCard";

const NARRATORS: VideoNarrator[] = ["local", "openai"];

// The two narrators side by side, each with what it costs and what it means,
// so the trade-off reads at a glance. A card is the radio button.
export function VideoNarratorCards({
  value,
  onChange,
  keySaved,
  localVoiceReady,
}: {
  value: VideoNarrator;
  onChange: (narrator: VideoNarrator) => void;
  // Null while still unknown.
  keySaved: boolean | null;
  localVoiceReady: boolean | null;
}) {
  const localFacts: NarratorFact[] = [
    { Icon: ShieldCheck, text: "Nothing leaves this Mac" },
    { Icon: Languages, text: "English only" },
  ];
  if (localVoiceReady === true) localFacts.push({ Icon: Check, text: "Installed · about 1 GB", tone: "ok" });
  if (localVoiceReady === false) localFacts.push({ Icon: Download, text: "About 1 GB to download, once" });

  const cloudFacts: NarratorFact[] = [
    { Icon: Globe, text: "Speaks most languages" },
    { Icon: ArrowUpRight, text: "Script text goes to OpenAI" },
    keySaved
      ? { Icon: Check, text: "Your key is saved", tone: "ok" }
      : { Icon: KeyRound, text: "Needs your own API key", tone: value === "openai" && keySaved === false ? "warn" : "muted" },
  ];

  const pick = (narrator: VideoNarrator) => {
    if (narrator !== value) onChange(narrator);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = NARRATORS[(NARRATORS.indexOf(value) + 1) % NARRATORS.length];
    pick(next);
    (e.currentTarget.querySelector(`[data-narrator="${next}"]`) as HTMLElement | null)?.focus();
  };

  return (
    <div role="radiogroup" aria-label="Narrator" onKeyDown={onKeyDown} className="grid grid-cols-2 gap-2.5">
      <VideoNarratorCard
        narrator="local"
        on={value === "local"}
        onPick={pick}
        Icon={Laptop}
        title="On this Mac"
        price="Free"
        facts={localFacts}
      />
      <VideoNarratorCard
        narrator="openai"
        on={value === "openai"}
        onPick={pick}
        Icon={Cloud}
        title="OpenAI cloud"
        price={`≈ ${CLOUD_PER_MINUTE}`}
        per="a minute"
        facts={cloudFacts}
      />
    </div>
  );
}
