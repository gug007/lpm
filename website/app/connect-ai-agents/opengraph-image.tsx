import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Claude Code skills and Codex tools for running your dev environment with lpm.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Claude Code skills and Codex tools", "for your dev environment."],
    subline:
      "One click gives Claude Code, Codex, Gemini CLI, and OpenCode a CLI to start, stop, and restart services, read logs, and fan out into parallel copies.",
  });
}
