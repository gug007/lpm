import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Control Claude Code, Codex, and your dev projects from your iPhone with the lpm companion app.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Run Claude Code and Codex", "from your phone."],
    subline:
      "The lpm iOS app mirrors every Mac terminal live — prompt agents, review diffs, commit and push, and get an encrypted alert when an agent is waiting.",
  });
}
