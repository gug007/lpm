import { SquarePlay } from "lucide-react";
import { BrowserOpenURL } from "../../../bridge/runtime";

export const VIDEO_LINK_CLASS =
  "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--accent-blue-text)] underline-offset-2 transition-colors hover:underline";

interface VideoLinkProps {
  url: string;
  label: string;
  length: string;
}

/** A lesson on YouTube, opened in the browser beside the UI it walks through. */
export function VideoLink({ url, label, length }: VideoLinkProps) {
  return (
    <button
      type="button"
      onClick={() => BrowserOpenURL(url)}
      className={VIDEO_LINK_CLASS}
    >
      <SquarePlay size={14} />
      {label} · {length}
    </button>
  );
}
