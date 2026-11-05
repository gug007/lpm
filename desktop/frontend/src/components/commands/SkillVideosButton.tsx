import { useRef, useState } from "react";
import { ChevronDown, SquarePlay } from "lucide-react";
import { BrowserOpenURL } from "../../../bridge/runtime";
import { lessonUrl } from "../../lessons";
import { LessonThumbnail } from "../LessonThumbnail";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { ContextMenuShell } from "../ui/ContextMenuShell";
import { VIDEO_LINK_CLASS } from "../ui/VideoLink";
import { SKILL_VIDEOS } from "./skillVideos";

// The Skills tab's lessons on YouTube, opened in the browser beside the page
// they walk through.
export function SkillVideosButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={VIDEO_LINK_CLASS}
      >
        <SquarePlay size={14} />
        Video guides
        <ChevronDown size={11} />
      </button>
      {open && ref.current && (
        <ContextMenuShell anchor={ref.current} align="end" minWidth={270} onClose={() => setOpen(false)}>
          {SKILL_VIDEOS.map((video) => (
            <ContextMenuItem
              key={video.id}
              icon={
                <span className="block aspect-video w-16 overflow-hidden rounded bg-[var(--bg-hover)]">
                  <LessonThumbnail id={video.id} />
                </span>
              }
              label={video.title}
              trailing={<span className="text-[10px] tabular-nums">{video.length}</span>}
              onClick={() => {
                setOpen(false);
                BrowserOpenURL(lessonUrl(video.id));
              }}
            />
          ))}
        </ContextMenuShell>
      )}
    </>
  );
}
