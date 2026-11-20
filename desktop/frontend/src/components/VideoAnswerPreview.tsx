import type { CSSProperties } from "react";
import type { AICLI } from "../types";
import { VIDEO_LESSON_LENGTH, VIDEO_LESSON_URL } from "../videoLesson";
import { AnswerPreviewCard } from "./AnswerPreviewCard";
import { PlayIcon } from "./icons";
import { VideoLessonLink } from "./VideoLessonLink";
import { VideoVoiceLine } from "./VideoVoiceLine";

// A still in explaincast's own look, a warm canvas and a serif title, so it
// reads as a frame of a video rather than a piece of lpm.
const FRAME: CSSProperties = {
  backgroundColor: "#ebe5d9",
  backgroundImage:
    "radial-gradient(circle at 18% 28%, #f2d6c2 0, rgba(242,214,194,0) 46%), radial-gradient(circle at 82% 22%, #e9dcb6 0, rgba(233,220,182,0) 42%), radial-gradient(circle at 60% 88%, #d7e0cd 0, rgba(215,224,205,0) 46%)",
  color: "#141414",
};
const SERIF: CSSProperties = { fontFamily: '"Iowan Old Style", Palatino, Georgia, serif' };

// The Video button's hover card: a question as it would be typed, and the
// agent's reply to it as a video.
export function VideoAnswerPreview({ agent, on = false }: { agent: AICLI | null; on?: boolean }) {
  return (
    <AnswerPreviewCard
      kind="video"
      agent={agent}
      question="How does checkout apply a coupon?"
      reply={
        <div
          aria-hidden
          style={FRAME}
          className="relative h-[148px] min-w-0 flex-1 overflow-hidden rounded-[4px_12px_12px_12px] border border-[var(--border)]"
        >
          <span
            style={SERIF}
            className="absolute left-3.5 right-[60px] top-[13px] text-[15px] font-semibold leading-[1.18] tracking-[-0.01em]"
          >
            How a coupon gets applied at checkout
          </span>
          <span className="absolute left-3.5 top-[78px] flex gap-3 rounded-md border border-[#d8cfbf] bg-[#fffdf8] px-2 py-1.5 font-mono text-[10px] font-semibold leading-none shadow-[0_1px_2px_rgba(60,40,10,0.08)]">
            <span>SPRING20</span>
            <span className="text-[#2c7a4b]">−$12.00</span>
          </span>
          <span className="absolute right-3.5 top-[72px] flex h-[34px] w-[34px] items-center justify-center rounded-full bg-[rgba(20,20,20,0.8)] pl-0.5 text-white shadow-[0_0_0_4px_rgba(255,255,255,0.4),0_4px_10px_rgba(0,0,0,0.18)] [&>svg]:h-3 [&>svg]:w-3">
            <PlayIcon />
          </span>
          <span className="absolute right-2 top-2 rounded-[5px] bg-[rgba(20,20,20,0.8)] px-1.5 py-[3px] text-[10px] font-semibold leading-[1.1] tabular-nums text-white">
            1:08
          </span>
        </div>
      }
      title={on ? "Answering as a video" : "Answer as a video"}
      about="Ask as usual. The reply is a narrated video."
      on={on}
      extra={<VideoLessonLink url={VIDEO_LESSON_URL} length={VIDEO_LESSON_LENGTH} />}
      foot={<VideoVoiceLine />}
    />
  );
}
