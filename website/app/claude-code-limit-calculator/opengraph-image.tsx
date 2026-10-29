import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Claude Code limit calculator: see whether you'll run out of your 5-hour or weekly limit before it resets.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Will you hit your", "Claude Code limit?"],
    subline:
      "Enter your 5-hour or weekly usage and the time elapsed. See your pace and when you'll run out before the reset. Works for Codex too.",
    eyebrow: "Free limit calculator",
    platform: "Free · runs in your browser",
  });
}
