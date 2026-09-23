import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "An Overmind alternative for Mac — your Procfile as live panes, no tmux.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: [
      "An Overmind alternative for Mac",
      "— your Procfile as live panes.",
    ],
    subline:
      "Restart any one process with no tmux installed, and the Procfile imported line by line when you add the folder.",
  });
}
