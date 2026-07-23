import {
  CopyPlus,
  Play,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Step = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: CopyPlus,
    title: "Copy the project you have now",
    body: "On APFS, lpm starts with a fast copy-on-write clone. Uncommitted work, useful ignored files, and installed dependencies come with it by default.",
  },
  {
    icon: SlidersHorizontal,
    title: "Choose how clean each copy should be",
    body: "Keep the current state, strip uncommitted changes, pull the latest upstream commit, or reinstall dependencies. Stale build caches are left behind.",
  },
  {
    icon: Play,
    title: "Run work immediately",
    body: "Create one copy or fan out up to 50. Give every copy a label, group them, and queue the same or a different action, command, and prompt.",
  },
];

export default function HowDuplicateWorks() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="How lpm Duplicate works"
          title="From active project to running agent in one flow"
          description="The unit of duplication is the project on your Mac, not only its tracked Git files."
          className="mb-12"
        />

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, index) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-white/[0.05] dark:text-gray-300">
                  <Icon className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="text-xs font-semibold tabular-nums text-gray-300 dark:text-gray-700">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-950 shadow-2xl shadow-gray-200/60 dark:border-gray-800 dark:shadow-black/40">
          <video
            src="/screenrecording/duplicate-project.mp4"
            poster="/screenrecording/duplicate-project-poster.jpg"
            width={1224}
            height={804}
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-label="Duplicating a project in lpm to create an independent copy for another coding agent"
            className="h-auto w-full"
          />
        </div>
      </div>
    </section>
  );
}
