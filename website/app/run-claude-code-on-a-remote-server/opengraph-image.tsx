import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Run Claude Code and Codex on a Linux server you own, driven from the lpm app on your Mac.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Run Claude Code and Codex", "on a Linux server."],
    subline:
      "Type user@host. lpm installs and pairs itself over SSH — then the server's projects, terminals and agents keep running with your lid closed.",
  });
}
