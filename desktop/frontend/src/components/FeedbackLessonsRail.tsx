import { BrowserOpenURL } from "../../bridge/runtime";
import {
  LESSONS,
  MAKER_LINKEDIN_URL,
  MAKER_X_URL,
  lessonDate,
  lessonUrl,
} from "../lessons";
import { TUTORIAL_PLAYLIST_URL } from "../sidebarNav";
import { PlayIcon, YoutubeIcon } from "./icons";
import { LessonThumbnail } from "./LessonThumbnail";
import { CAPS_LABEL } from "./settings/sectionStyles";
import { BTN_SECONDARY, TEXT_ACTION } from "./ui/buttons";
import { NetworkLogo } from "./recap/NetworkLogo";
import type { RecapNetwork } from "./recap/recapShare";

const NEWS: { network: RecapNetwork; name: string; url: string }[] = [
  { network: "x", name: "X", url: MAKER_X_URL },
  { network: "linkedin", name: "LinkedIn", url: MAKER_LINKEDIN_URL },
];

// The newest few whose titles fit two lines, so every row is whole.
const RAIL_LESSONS = LESSONS.slice(0, 3);

export function FeedbackLessonsRail() {
  return (
    <aside
      aria-label="Lessons and news"
      className="flex flex-col border-t border-[var(--border)] bg-[var(--bg-secondary)]/40 px-5 py-5 md:w-[300px] md:shrink-0 md:border-l md:border-t-0"
    >
      <h3 className={CAPS_LABEL}>Before you write</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
        A short lesson might already answer it.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {RAIL_LESSONS.map((lesson) => (
          <li key={lesson.id}>
            <button
              type="button"
              onClick={() => BrowserOpenURL(lessonUrl(lesson.id))}
              className="group flex h-[50px] w-full items-start gap-2.5 text-left"
            >
              <span className="relative aspect-video w-[72px] shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg-hover)] transition-colors group-hover:border-[var(--text-muted)]">
                <LessonThumbnail id={lesson.id} />
                <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/75 pl-px text-white [&>svg]:h-2 [&>svg]:w-2">
                    <PlayIcon />
                  </span>
                </span>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="line-clamp-2 text-[12px] leading-snug text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                  {lesson.title}
                </span>
                <span className="text-[11px] text-[var(--text-muted)]">
                  {lessonDate(lesson.published)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => BrowserOpenURL(TUTORIAL_PLAYLIST_URL)}
        className={`${BTN_SECONDARY} mt-4 inline-flex items-center justify-center gap-1.5`}
      >
        <YoutubeIcon />
        All lessons on YouTube
      </button>
      <div className="mt-auto flex flex-wrap items-center gap-x-1 pt-4 text-[12px] text-[var(--text-muted)]">
        <span className="mr-0.5">Follow lpm news on</span>
        {NEWS.map(({ network, name, url }) => (
          <button
            key={network}
            type="button"
            aria-label={`lpm's maker on ${name}`}
            title={`News from lpm's maker on ${name}`}
            onClick={() => BrowserOpenURL(url)}
            className={TEXT_ACTION}
          >
            <NetworkLogo network={network} size={11} />
            {name}
          </button>
        ))}
      </div>
    </aside>
  );
}
