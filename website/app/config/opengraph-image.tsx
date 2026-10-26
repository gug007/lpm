import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm config — ask your AI agent to set up a project, or edit services, actions, terminals, zones, and profiles yourself.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "Configure lpm",
    subline:
      "Ask Claude Code or Codex to set up a project, or edit every key yourself — services, actions, terminals, zones, and profiles.",
    eyebrow: "Docs",
  });
}
