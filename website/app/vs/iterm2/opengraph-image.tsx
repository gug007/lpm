import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "An iTerm2 alternative that runs whole projects, not just panes.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["An iTerm2 alternative that runs", "whole projects, not just panes."],
    subline:
      "One click starts every service, ports on each service tab, a checkout per agent. Keep iTerm2 for the shell.",
  });
}
