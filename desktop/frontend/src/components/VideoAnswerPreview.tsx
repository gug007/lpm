import type { CSSProperties } from "react";
import type { AICLI } from "../types";
import { AgentGlyph } from "./terminal/AgentGlyph";
import { PlayIcon, VideoIcon } from "./icons";
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

// The Video button's tooltip: a question as it would be typed, and the agent's
// reply to it as a video, so the button explains itself by example.
export function VideoAnswerPreview({ agent }: { agent: AICLI | null }) {
  return (
    <div className="flex w-[296px] flex-col gap-2.5 py-0.5">
      <div className="self-end rounded-[12px_12px_4px_12px] bg-[var(--bg-active)] px-2.5 py-1.5 leading-snug text-[var(--text-primary)]">
        How does checkout apply a coupon?
      </div>
      <div className="flex items-start gap-2">
        <span
          aria-hidden
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[var(--text-secondary)] [&>svg]:h-3 [&>svg]:w-3"
        >
          {agent ? <AgentGlyph agent={agent} size={12} /> : <VideoIcon size={12} />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 rounded-[4px_12px_12px_12px] border border-[var(--border)] bg-[var(--bg-primary)] p-1.5">
          <div aria-hidden style={FRAME} className="relative h-[138px] overflow-hidden rounded-lg">
            <span style={SERIF} className="absolute left-3 right-16 top-2.5 text-[14px] font-semibold leading-tight">
              How a coupon gets applied at checkout
            </span>
            <span className="absolute left-3 top-[62px] flex gap-3 rounded-md border border-[#d5cdbd] bg-[#fffdf8] px-2 py-1.5 font-mono text-[10px] font-semibold leading-none">
              <span>SPRING20</span>
              <span className="text-[#2c7a4b]">−$12.00</span>
            </span>
            <span className="absolute right-4 top-11 flex h-9 w-9 items-center justify-center rounded-full bg-[rgba(20,20,20,0.82)] pl-0.5 text-white">
              <PlayIcon />
            </span>
            <span className="absolute right-2 top-2 rounded bg-[rgba(20,20,20,0.85)] px-1.5 py-1 text-[10px] font-semibold leading-none text-white">
              1:08
            </span>
            <span className="absolute inset-x-0 bottom-0 bg-[rgba(20,20,20,0.72)] px-3 py-1.5 text-[10.5px] leading-snug text-white">
              …and the total updates before tax.
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-1 pb-0.5 text-[11px] text-[var(--text-muted)]">
            <span aria-hidden className="flex text-[var(--accent-violet)] [&>svg]:h-2.5 [&>svg]:w-2.5">
              <PlayIcon />
            </span>
            <span className="text-[var(--text-secondary)]">1:08</span>
            <span>· chapters · captions</span>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="font-medium text-[var(--text-primary)]">Answer as a video</span>
        <span className="leading-snug text-[var(--text-muted)]">Ask as usual. The reply is a narrated video.</span>
      </div>
      <VideoVoiceLine />
    </div>
  );
}
