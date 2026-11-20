import type { CSSProperties } from "react";

// A sunset over hills, drawn rather than shipped, so the reply reads as a
// picture without an image file in the bundle.
const SKY: CSSProperties = {
  background:
    "radial-gradient(circle at 70% 46%, #fff3c4 0, #ffd27a 9%, rgba(255,210,122,0) 22%), linear-gradient(180deg, #6d7fd6 0%, #c58fd0 42%, #f4a99a 70%, #ffd2a1 100%)",
};
const HILL_BACK: CSSProperties = { background: "#7a5aa6", clipPath: "polygon(0 62%, 22% 48%, 46% 60%, 70% 44%, 100% 58%, 100% 100%, 0 100%)" };
const HILL_FRONT: CSSProperties = { background: "#3f3470", clipPath: "polygon(0 78%, 30% 64%, 58% 76%, 84% 66%, 100% 72%, 100% 100%, 0 100%)" };

// The image hover card's reply: the picture the agent made, as the file it saved.
export function GeneratedImageReply() {
  return (
    <div
      aria-hidden
      style={SKY}
      className="relative h-[148px] min-w-0 flex-1 overflow-hidden rounded-[4px_12px_12px_12px] border border-[var(--border)]"
    >
      <span style={HILL_BACK} className="absolute inset-0" />
      <span style={HILL_FRONT} className="absolute inset-0" />
      <span className="absolute bottom-2 left-2 rounded-[5px] bg-[rgba(20,20,20,0.7)] px-1.5 py-[3px] font-mono text-[10px] leading-[1.1] text-white">
        generated/pricing-hero.png
      </span>
    </div>
  );
}
