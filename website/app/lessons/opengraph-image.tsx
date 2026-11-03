import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";
import { YOUTUBE_LESSON_COUNT } from "@/lib/youtube-lessons";

export const alt = "lpm lessons — short videos recorded in the real app.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Learn lpm in", "short videos."],
    subline: `${YOUTUBE_LESSON_COUNT} lessons recorded in the real app: dev servers, Claude Code and Codex in parallel, automations, servers and your iPhone.`,
    eyebrow: "Lessons",
  });
}
