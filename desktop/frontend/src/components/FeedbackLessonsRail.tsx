import { BrowserOpenURL } from "../../bridge/runtime";
import {
  LESSONS,
  MAKER_LINKEDIN_URL,
  MAKER_X_URL,
  lessonDate,
  lessonThumbnail,
  lessonUrl,
} from "../lessons";
import { TUTORIAL_PLAYLIST_URL } from "../sidebarNav";
import { PlayIcon, YoutubeIcon } from "./icons";
import { NetworkLogo } from "./recap/NetworkLogo";
import type { RecapNetwork } from "./recap/recapShare";

const NEWS: { network: RecapNetwork; name: string; url: string }[] = [
  { network: "x", name: "X", url: MAKER_X_URL },
  { network: "linkedin", name: "LinkedIn", url: MAKER_LINKEDIN_URL },
];

export function FeedbackLessonsRail() {
  return (
    <aside
      aria-label="Lessons and news"
      className="relative border-t border-[var(--border)] bg-[var(--bg-secondary)]/40 md:w-[320px] md:shrink-0 md:border-l md:border-t-0"
    >
      <div className="flex flex-col gap-3.5 px-5 pb-5 pt-6 md:absolute md:inset-0">
        <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">
          Watch how it works
        </h3>
        <ul className="-mx-5 flex max-h-[360px] flex-col gap-3 overflow-y-auto px-5 md:max-h-none md:min-h-0 md:flex-1">
          {LESSONS.map((lesson) => (
            <li key={lesson.id}>
              <button
                type="button"
                onClick={() => BrowserOpenURL(lessonUrl(lesson.id))}
                className="group flex w-full items-start gap-2.5 text-left"
              >
                <span className="relative aspect-video w-[112px] shrink-0 overflow-hidden rounded-[7px] border border-[var(--border)] bg-[var(--bg-hover)] transition-colors group-hover:border-[var(--text-muted)]">
                  <img
                    src={lessonThumbnail(lesson.id)}
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = "hidden";
                    }}
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-black/75 pl-px text-white [&>svg]:h-2.5 [&>svg]:w-2.5">
                      <PlayIcon />
                    </span>
                  </span>
                </span>
                <span className="flex min-w-0 flex-col gap-[3px]">
                  <span className="line-clamp-2 text-[11px] font-medium leading-snug text-[var(--text-primary)] group-hover:underline group-hover:decoration-[var(--text-muted)] group-hover:underline-offset-2">
                    {lesson.title}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)]">
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
          className="flex items-center gap-1.5 self-start text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <YoutubeIcon />
          All lessons on YouTube
        </button>
        <div className="flex shrink-0 flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3.5">
          <div>
            <p className="text-[12px] font-semibold text-[var(--text-primary)]">
              lpm news
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
              Shared by lpm's maker on X and LinkedIn.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {NEWS.map(({ network, name, url }) => (
              <button
                key={network}
                type="button"
                aria-label={`lpm's maker on ${name}`}
                onClick={() => BrowserOpenURL(url)}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-[7px] text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
              >
                <NetworkLogo network={network} size={12} />
                {name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
