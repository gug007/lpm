import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm — Claude Code and Codex tokens and cost by project, plus live 5-hour and weekly limits.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Claude Code and Codex usage", "Tokens, cost, and limits."],
    subline:
      "Tokens and estimated cost by project, plus live 5-hour and weekly meters with pace, in one private app on your Mac.",
  });
}
