import { Cloud, Laptop } from "lucide-react";
import type { VideoNarrator } from "../../store/settings";
import { CLOUD_PRICE } from "../../videoVoice";
import { SegmentButton } from "../settings/SegmentButton";

const NARRATORS = [
  { narrator: "local", label: "On this Mac · free", Icon: Laptop },
  { narrator: "openai", label: `OpenAI cloud · ${CLOUD_PRICE}`, Icon: Cloud },
] as const;

export function VideoNarratorControl({
  value,
  onChange,
}: {
  value: VideoNarrator;
  onChange: (narrator: VideoNarrator) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Narrator"
      className="flex w-fit rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-0.5"
    >
      {NARRATORS.map(({ narrator, label, Icon }) => (
        <SegmentButton
          key={narrator}
          label={label}
          icon={<Icon size={12} strokeWidth={2} />}
          active={value === narrator}
          onClick={() => {
            if (narrator !== value) onChange(narrator);
          }}
        />
      ))}
    </div>
  );
}
