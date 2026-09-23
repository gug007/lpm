import Image from "next/image";
import {
  youtubeLesson,
  youtubeThumbnailUrl,
  type YouTubeLessonId,
} from "@/lib/youtube-lessons";

type Props = {
  index: number;
  title: string;
  blurb: string;
  lesson: YouTubeLessonId;
  active: boolean;
  controls: string;
  onSelect: () => void;
};

// The title's button stretches over the whole row, so the row is one target
// while the heading and blurb stay plain text in the outline.
export function LessonRow({
  index,
  title,
  blurb,
  lesson,
  active,
  controls,
  onSelect,
}: Props) {
  const { id } = youtubeLesson(lesson);
  return (
    <li
      className={`relative flex items-center gap-3.5 rounded-xl p-2.5 pr-3 transition-colors ${
        active
          ? "bg-white shadow-sm ring-1 ring-gray-200 dark:bg-white/[0.06] dark:shadow-none dark:ring-white/10"
          : "hover:bg-white/70 dark:hover:bg-white/[0.03]"
      }`}
    >
      <div
        className={`relative aspect-video w-[5.5rem] shrink-0 overflow-hidden rounded-md bg-[#ebe5d9] ${
          active
            ? "ring-2 ring-gray-900 dark:ring-white"
            : "ring-1 ring-black/5 dark:ring-white/10"
        }`}
      >
        <Image
          src={youtubeThumbnailUrl(id)}
          alt=""
          fill
          sizes="88px"
          className="object-cover"
        />
        <span className="absolute bottom-1 left-1 rounded bg-gray-900/85 px-1 py-px text-[10px] font-semibold tabular-nums leading-tight text-white">
          {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold leading-snug text-gray-900 dark:text-gray-100">
          <button
            type="button"
            aria-pressed={active}
            aria-controls={controls}
            onClick={onSelect}
            className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-gray-900 dark:focus-visible:after:ring-white"
          >
            {title}
          </button>
        </h3>
        <p className="mt-0.5 text-[13px] leading-snug text-gray-600 dark:text-gray-400">
          {blurb}
        </p>
      </div>
    </li>
  );
}
