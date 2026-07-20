import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — Claude Code and Codex token usage by project, model, provider, and session.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Every Claude Code and Codex token", "By project."],
    subline:
      "Track tokens, approximate cost, cache usage, models, and sessions in one private dashboard on your Mac.",
  });
}
