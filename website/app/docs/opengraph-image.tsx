import { APP_WINDOW } from "@/lib/og-app-window";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm docs — install lpm, ask your AI agent to set up a project, or edit services, actions, terminals, zones, and profiles yourself.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: "lpm docs",
    subline:
      "Install lpm, then ask Claude Code or Codex to set up a project, or edit every key yourself.",
    eyebrow: "Docs",
    image: APP_WINDOW,
  });
}
