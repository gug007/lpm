import { ArrowUpRight, Code2, SlidersHorizontal } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { YouTubeVideo } from "@/components/youtube-video";
import { YOUTUBE_PLAYLIST_URL } from "@/lib/youtube-lessons";
import { STATUSLINE_LESSONS } from "./statusline-copy";

const ICONS = { claude: Code2, codex: SlidersHorizontal };

export default function Lessons() {
  return (
    <section
      id="watch"
      className="scroll-mt-20 border-y border-gray-100 bg-gray-50/70 py-20 dark:border-gray-800/70 dark:bg-white/[0.015] sm:py-24"
    >
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader
          eyebrow="Watch it in the real app"
          title="Set it up in under two minutes"
          description="Two short lessons recorded in lpm, one per agent. Each goes from the default prompt to one that shows your 5-hour and weekly limits and the context left."
        />

        <div className="grid gap-5 md:grid-cols-2">
          {STATUSLINE_LESSONS.map(
            ({ agent, lesson, title, length, steps, tone }) => {
              const Icon = ICONS[agent];
              return (
                <article
                  key={lesson}
                  className={`flex flex-col overflow-hidden rounded-3xl border bg-white shadow-sm dark:bg-[#151515] ${tone.border}`}
                >
                  <YouTubeVideo
                    lesson={lesson}
                    sizes="(min-width: 1024px) 490px, (min-width: 768px) 50vw, 100vw"
                  />
                  <div className="flex flex-1 flex-col p-6 sm:p-7">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-xl ${tone.chip}`}
                        >
                          <Icon className="h-[18px] w-[18px]" aria-hidden />
                        </span>
                        <h3 className="text-lg font-bold text-gray-950 dark:text-white">
                          {title}
                        </h3>
                      </div>
                      <span className="rounded-full bg-gray-100 px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {length}
                      </span>
                    </div>
                    <ol className="mt-5 space-y-3.5">
                      {steps.map((step, i) => (
                        <li
                          key={step}
                          className="flex gap-3 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
                        >
                          <span
                            className={`mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${tone.chip}`}
                          >
                            {i + 1}
                          </span>
                          {step}
                        </li>
                      ))}
                    </ol>
                  </div>
                </article>
              );
            },
          )}
        </div>

        <div className="mt-8 text-center">
          <a
            href={YOUTUBE_PLAYLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 px-3 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-gray-400 dark:hover:text-white dark:focus-visible:ring-white"
          >
            Every lpm lesson on YouTube
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      </div>
    </section>
  );
}
