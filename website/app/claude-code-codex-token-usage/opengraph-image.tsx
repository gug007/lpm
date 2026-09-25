import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm: Claude Code and Codex tokens by project, estimated cost, and live 5-hour and weekly limits with pace.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Claude Code & Codex", "tokens, cost & limits."],
    subline:
      "Tokens by project and session, live 5-hour and weekly meters with pace, and a prompt sent when your limit resets. Free for Mac.",
  });
}
