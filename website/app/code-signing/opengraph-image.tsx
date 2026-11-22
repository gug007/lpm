import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "lpm code signing policy — who signs the Windows installer, what gets signed, and who approves a release.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Code signing", "policy"],
    subline:
      "Windows installers built by GitHub Actions from public source and signed through SignPath Foundation.",
    eyebrow: "Security",
  });
}
