import { ArrowUpRight } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { YouTubeVideo } from "@/components/youtube-video";
import { YOUTUBE_PLAYLIST_URL } from "@/lib/youtube-lessons";

const STEPS = [
  {
    title: "Right-click the project, choose Duplicate",
    body: "Or start from the prompt you are writing: open the menu beside Send and pick Run in duplicates.",
  },
  {
    title: "Set the count and what runs in each copy",
    body: "An action such as Claude or Codex, or any shell command, plus the prompt to send it. Label the copies and group them in a sidebar folder if you like.",
  },
  {
    title: "Confirm, then watch them work",
    body: "The copies appear in the sidebar — under the original, or in the folder you named — and each agent reports its state as it goes.",
  },
];

export default function Lesson() {
  return (
    <section id="watch" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Watch it"
          title="One project, several copies, an agent in each"
          description="A short lesson from the lpm series: duplicate a project and send the same prompt to an agent in every copy."
        />

        <div className="grid items-center gap-10 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <YouTubeVideo
              lesson="parallel-agents"
              className="rounded-xl shadow-2xl shadow-gray-200/60 ring-1 ring-black/5 dark:shadow-black/40 dark:ring-white/10"
            />
          </div>

          <div className="lg:col-span-2">
            <ol className="space-y-6">
              {STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 text-xs font-semibold tabular-nums text-gray-600 dark:border-gray-700 dark:text-gray-300">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {step.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <a
              href={YOUTUBE_PLAYLIST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Every lpm lesson on YouTube
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
