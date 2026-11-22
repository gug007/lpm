import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Port 3000 already in use: find the process holding it and stop it, on macOS, Linux and Windows.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Port 3000 already in use?", "Free it in one line."],
    subline:
      "Find what holds the port and stop it on macOS, Linux and Windows, and why it keeps happening.",
    eyebrow: "Dev servers",
  });
}
