import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og-template";

export const alt =
  "Foreman vs Overmind for a Rails Procfile — and a third option.";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({
    headline: ["Foreman vs Overmind for a", "Rails Procfile — and a third option."],
    subline:
      "One interleaved stream, one tmux-backed runner, one Mac app. What each does with the same three lines.",
  });
}
