import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "An iTerm2 alternative for Mac that manages whole projects, not just panes.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["An iTerm2 alternative", "that manages projects."],
    subline:
      "iTerm2 is the terminal emulator. lpm starts, stops, and duplicates whole projects — with a terminal inside. An honest side-by-side.",
  });
}
