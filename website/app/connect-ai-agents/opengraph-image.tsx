import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Connect Claude Code, Codex, Gemini CLI, and OpenCode to your dev environment with lpm.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Let your AI agents", "run your dev environment."],
    subline:
      "One click gives Claude Code, Codex, Gemini CLI, and OpenCode a CLI to start, stop, and restart services, read logs, and fan out into parallel copies.",
  });
}
