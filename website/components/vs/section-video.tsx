import { AutoVideo } from "@/components/auto-video";
import { SectionHeader } from "@/components/section-header";
import type { ScreenRecordingId } from "@/lib/structured-data";

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  clip: ScreenRecordingId;
  label: string;
};

// `clip` is an id rather than a src/poster pair so the footage on the page and
// the VideoObject markup emitted for it cannot drift apart.
export function SectionVideo({
  eyebrow,
  title,
  description,
  clip,
  label,
}: Props) {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-950 shadow-sm dark:border-gray-800">
          <AutoVideo
            src={`/screenrecording/${clip}.mp4`}
            poster={`/screenrecording/${clip}-poster.jpg`}
            label={label}
            className="w-full h-auto"
          />
        </div>
      </div>
    </section>
  );
}
