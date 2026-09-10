import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "A tmux alternative for Mac dev stacks — panes without .tmux.conf.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["A tmux alternative for Mac", "dev stacks — no .tmux.conf."],
    subline:
      "One live pane per service, no tmux installed, and an honest list of what tmux still does better.",
  });
}
