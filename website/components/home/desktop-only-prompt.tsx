import Link from "next/link";
import { WINDOW_FRAME } from "@/components/home/demo-window";
import { lessonPoster } from "@/components/home/lesson-data";
import { YouTubeVideo } from "@/components/youtube-video";
import { MOBILE_PATH } from "@/lib/links";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";
import { SendLinkButton } from "./send-link-button";

// What a phone gets in an interactive demo's place: the lesson plays there,
// and the button sends the page on to a computer that can run the demo. The
// lesson's title sits in the card, not on the poster, whose light screenshots
// show through white text.
export function DesktopOnlyPrompt({
  lesson,
  message,
  posterPriority = false,
}: {
  lesson: YouTubeLessonId;
  message: string;
  posterPriority?: boolean;
}) {
  const poster = lessonPoster(lesson);
  return (
    <div data-on-dark className={WINDOW_FRAME}>
      <YouTubeVideo
        lesson={lesson}
        poster={poster && { src: poster.src }}
        fetchPriority={posterPriority ? "high" : undefined}
      />
      <div className="flex flex-col items-center gap-3 border-t border-[#2e2e2e] px-5 py-5 text-center">
        {poster && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#919191]">
              {poster.label}
            </p>
            <p className="mt-0.5 text-lg font-bold tracking-tight text-[#e5e5e5]">
              {poster.title}
            </p>
          </div>
        )}
        <p className="max-w-xs text-[13px] leading-relaxed text-[#919191]">
          {message}
        </p>
        <SendLinkButton
          variant="onDark"
          label="Send lpm to my computer"
          to="page"
        />
        <Link
          href={MOBILE_PATH}
          className="text-[12px] text-[#919191] underline decoration-[#4a4a4a] underline-offset-4 transition-colors hover:text-white hover:decoration-current"
        >
          Or check your computers from your iPhone
        </Link>
      </div>
    </div>
  );
}
