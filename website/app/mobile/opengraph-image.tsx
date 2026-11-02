import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Control Claude Code and Codex on your Mac from your iPhone with the lpm companion app.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const phone = await readFile(
  join(process.cwd(), "public/og/lpm-link-agent.jpg"),
  "base64",
);

export default function Image() {
  return ogImage({
    headline: ["Control Claude Code", "and Codex from", "your iPhone."],
    subline:
      "Prompt agents, review the diff, and get an alert the moment one is waiting.",
    eyebrow: "The lpm companion for iPhone & iPad",
    platform: "Free on the App Store",
    image: { src: `data:image/jpeg;base64,${phone}`, frame: "phone" },
  });
}
