import { ArrowUpRight } from "lucide-react";
import { BrowserOpenURL } from "../../bridge/runtime";
import { PlayIcon } from "./icons";

// The lesson on YouTube, under the Video button's hover card text: opened in
// the browser without taking focus from the prompt being typed.
export function VideoLessonLink({ url, length }: { url: string; length: string }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => BrowserOpenURL(url)}
      className="-ml-1.5 mt-[3px] flex items-center gap-1.5 self-start rounded-[7px] bg-[color-mix(in_srgb,var(--accent-violet)_12%,transparent)] py-[5px] pl-1.5 pr-[7px] text-[12px] font-medium leading-[1.2] text-[var(--accent-violet-text)] transition-colors hover:bg-[color-mix(in_srgb,var(--accent-violet)_20%,transparent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-violet)]/40"
    >
      <span aria-hidden className="flex [&>svg]:h-2.5 [&>svg]:w-2.5">
        <PlayIcon />
      </span>
      Watch the lesson · {length}
      <ArrowUpRight aria-hidden size={11} strokeWidth={2.2} />
    </button>
  );
}
