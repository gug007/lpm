import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm security — how builds are signed and checked, what the app changes on your computer, and what it sends.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["What lpm installs,", "signs and sends"],
    subline:
      "Signed and notarized Mac builds, SHA-256 checksums for every file, and no telemetry in the apps.",
    eyebrow: "Security",
  });
}
