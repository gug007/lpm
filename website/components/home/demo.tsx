"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useInView } from "@/components/config/playground/hooks";
import {
  HOME_TOUR,
  type Tour,
  type TourHandle,
  type TourState,
} from "@/components/demo/tour";
import { DownloadLink } from "@/components/download-link";
import { DemoSteps } from "@/components/home/demo-steps";
import { YouTubeVideo } from "@/components/youtube-video";
import { MOBILE_PATH } from "@/lib/links";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

// Set by .demo-stage in globals.css: capped where a 1040px stage keeps the
// app's 3:2 proportions, and shorter from lg up, where the step list takes a
// column beside the frame.
const DEMO_HEIGHT_DESKTOP = "var(--demo-stage-h)";

// Same recipe as the macOS windows in before-after-window.tsx: the edge comes
// from a ring, the depth from a layered shadow.
const WINDOW_FRAME =
  "overflow-hidden rounded-xl bg-[#1a1a1a] ring-1 ring-white/[0.16] shadow-[0_1px_0_0_rgba(0,0,0,0.8),0_24px_60px_-20px_rgba(0,0,0,0.9)]";

const DemoApp = dynamic(
  () => import("@/components/demo/demo-app").then((m) => m.DemoApp),
  {
    ssr: false,
    loading: () => <DemoPlaceholder />,
  },
);

// The frame's own furniture, drawn rather than photographed. A screenshot here
// would be a picture of some other workspace, so every element would change the
// moment the demo mounted; this holds the exact shape the demo arrives in.
function SkeletonBar({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded bg-[#2e2e2e] motion-safe:animate-pulse ${className}`} />
  );
}

function DemoPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-[var(--demo-h)] ${WINDOW_FRAME}`}
      style={{ "--demo-h": DEMO_HEIGHT_DESKTOP } as React.CSSProperties}
    >
      <div className="hidden w-52 shrink-0 flex-col border-r border-[#2e2e2e] bg-[#1e1e1e] sm:flex lg:w-[260px]">
        <div className="flex h-11 shrink-0 items-center gap-2 px-[14px] pt-[7px]">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wider text-[#919191]">
          Projects
        </div>
        <div className="flex flex-col gap-1 px-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2">
              <span className="h-2 w-2 shrink-0 rounded-full border border-[#3a3a3a]" />
              <SkeletonBar className="h-2.5 flex-1" />
            </div>
          ))}
        </div>
        {/* The footer the sidebar carries, so the column does not visibly grow
            a bottom half the moment the demo arrives. */}
        <div className="mt-auto flex flex-col gap-3 p-3">
          <SkeletonBar className="h-1 w-full" />
          <SkeletonBar className="h-1 w-full" />
          <SkeletonBar className="h-3 w-20" />
          <SkeletonBar className="h-3 w-14" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-4 px-3 py-3">
          <SkeletonBar className="h-4 w-28" />
          <div className="ml-auto flex items-center gap-2">
            <SkeletonBar className="h-8 w-24" />
            <SkeletonBar className="h-8 w-20" />
            <SkeletonBar className="h-8 w-16" />
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center border-t border-[#2e2e2e]">
          <span className="text-[13px] text-[#919191]">Loading demo…</span>
        </div>
      </div>
    </div>
  );
}

// What a phone reads above the lesson it plays instead of the demo: a heading
// for that lesson, not for the tour it stands in for, and one line on what it
// shows.
const LESSON_CAPTION: Record<
  YouTubeLessonId,
  { heading: string; blurb: string }
> = {
  "sixty-seconds": {
    heading:
      "Start a project, then hand it to Claude Code or Codex — one click each",
    blurb: "A one-minute tour: start a project and hand it to Claude Code.",
  },
  "add-project": {
    heading: "Add a folder, and it becomes a project",
    blurb: "A short video: pick a folder or clone a repo, and it joins the sidebar.",
  },
  "start-project": {
    heading: "Every service starts with one click",
    blurb: "A short video: each service streams in a pane of its own.",
  },
  "edit-services": {
    heading: "Edit a service, add another, start both",
    blurb: "A short video: change a service, then add a second one.",
  },
  "add-action": {
    heading: "Turn a command into a button",
    blurb: "A short video: add an action, then run it with one click.",
  },
  "switch-profiles": {
    heading: "Run only the services you need",
    blurb: "A short video: a profile starts just the services it names.",
  },
  "parallel-agents": {
    heading: "One project, several copies, an agent in each",
    blurb: "A short video: duplicate a project so each agent has its own copy.",
  },
};

function DesktopOnlyPrompt({
  lesson,
  posterPriority,
}: {
  lesson: YouTubeLessonId;
  posterPriority: boolean;
}) {
  return (
    <div data-on-dark className={WINDOW_FRAME}>
      <YouTubeVideo
        lesson={lesson}
        fetchPriority={posterPriority ? "high" : undefined}
      />
      <div className="flex flex-col items-center gap-3 border-t border-[#2e2e2e] px-5 py-5 text-center">
        <p className="max-w-xs text-[13px] leading-relaxed text-[#919191]">
          lpm is a macOS app with a multi-pane terminal workspace. Open this
          page on your computer to try the interactive demo.
        </p>
        <DownloadLink className="rounded-lg bg-[#e5e5e5] px-4 py-2 text-[13px] font-medium text-[#1a1a1a] transition-all duration-100 hover:opacity-85 active:scale-[0.97]">
          Get lpm for Mac
        </DownloadLink>
        <Link
          href={MOBILE_PATH}
          className="text-[12px] text-[#919191] underline decoration-[#4a4a4a] underline-offset-4 transition-colors hover:text-white hover:decoration-current"
        >
          Or check your Macs from your iPhone
        </Link>
      </div>
    </div>
  );
}

// The frame sits in the first viewport, so the observer fires on load. Waiting
// for an idle slot keeps the demo's bundle off the critical path — the drawn
// placeholder is what the visitor sees while the page settles.
function useIdle() {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    const request = window.requestIdleCallback;
    if (!request) {
      const timer = window.setTimeout(() => setIdle(true), 300);
      return () => window.clearTimeout(timer);
    }
    const handle = request(() => setIdle(true), { timeout: 1500 });
    return () => window.cancelIdleCallback?.(handle);
  }, []);
  return idle;
}

function DemoStage({
  tour: script,
  lesson,
  posterPriority,
}: {
  tour: Tour;
  lesson: YouTubeLessonId;
  posterPriority: boolean;
}) {
  // null until the media query is read on the client. While null, both shells
  // stay mounted and CSS picks the visible one, so the first paint matches the
  // server HTML at every width (hidden subtrees don't fetch their media); once
  // detection resolves, the losing subtree unmounts entirely.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const { ref, inView } = useInView<HTMLDivElement>("600px 0px");
  const idle = useIdle();
  const [tour, setTour] = useState<TourState>({ stage: 0, playing: false });
  const tourRef = useRef<TourHandle>(null);
  const runStep = useCallback(
    (index: number) => tourRef.current?.run(index),
    [],
  );
  // A fresh key remounts the demo at its first frame, tour and all — the only
  // reset that cannot leave a stray tab or a half-run cursor behind.
  const [demoRun, setDemoRun] = useState(0);
  const restart = useCallback(() => {
    setTour({ stage: 0, playing: false });
    setDemoRun((n) => n + 1);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div ref={ref} className="demo-stage mx-auto max-w-[1040px] lg:max-w-none">
      {isDesktop !== true && (
        <div className={isDesktop === null ? "md:hidden" : undefined}>
          <DesktopOnlyPrompt lesson={lesson} posterPriority={posterPriority} />
        </div>
      )}
      {isDesktop !== false && (
        <div className={isDesktop === null ? "hidden md:block" : undefined}>
          <a
            href="#demo-next"
            className="sr-only focus:not-sr-only focus:mb-3 focus:inline-block focus:rounded-full focus:bg-gray-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white dark:focus:bg-white dark:focus:text-gray-900"
          >
            Skip the interactive demo
          </a>
          <div className="lg:grid lg:grid-cols-[272px_minmax(0,1fr)] lg:items-start lg:gap-6">
            <DemoSteps
              steps={script.steps}
              tour={tour}
              onRun={runStep}
              onRestart={restart}
            />
            <div className="min-w-0">
              {isDesktop && inView && idle ? (
                <DemoApp
                  key={demoRun}
                  heightCss={DEMO_HEIGHT_DESKTOP}
                  heightCssSm={DEMO_HEIGHT_DESKTOP}
                  tourRef={tourRef}
                  onTour={setTour}
                  tour={script}
                />
              ) : (
                <DemoPlaceholder />
              )}
              <p
                id="demo-next"
                tabIndex={-1}
                className="mt-4 text-center text-[13px] text-gray-500 dark:text-gray-400"
              >
                Done poking around?{" "}
                <DownloadLink className="underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:decoration-gray-600 dark:hover:text-white">
                  Get lpm for Mac
                </DownloadLink>{" "}
                and point it at your own projects.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DemoCaption({
  heading,
  blurb,
  lesson,
  headingId,
}: {
  heading: string;
  blurb: string;
  lesson: YouTubeLessonId;
  headingId: string;
}) {
  return (
    <div className="mb-4 flex flex-col items-center gap-2 text-center lg:mb-5 lg:flex-row lg:items-end lg:justify-between lg:gap-6 lg:text-left">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 lg:justify-start">
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          <span
            className="relative hidden h-1.5 w-1.5 md:inline-flex"
            aria-hidden="true"
          >
            <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="md:hidden">See it in action</span>
          <span className="hidden md:inline">Live interactive demo</span>
        </span>
        <h2 className="text-balance text-lg font-bold tracking-tight sm:text-xl md:hidden">
          {LESSON_CAPTION[lesson].heading}
        </h2>
        <h2
          id={headingId}
          className="hidden text-balance text-lg font-bold tracking-tight sm:text-xl md:block"
        >
          {heading}
        </h2>
      </div>
      <p className="max-w-md text-pretty text-[13px] leading-relaxed text-gray-500 lg:max-w-none lg:whitespace-nowrap lg:text-right dark:text-gray-400">
        <span className="md:hidden">{LESSON_CAPTION[lesson].blurb}</span>
        <span className="hidden md:inline">{blurb}</span>
      </p>
    </div>
  );
}

// What a page's demo shows: the tour it walks through (see the tours defined
// in components/demo/tour.ts, or build one with defineTour), the caption above
// it, and the lesson a phone plays in its place.
export type PageDemo = {
  tour?: Tour;
  heading?: string;
  // The desktop line beside the heading.
  blurb?: string;
  lesson?: YouTubeLessonId;
};

// Only a page whose demo sits in the first screen should set posterPriority.
export function DemoSection({
  tour = HOME_TOUR,
  heading = "Start a project, then hand it to Claude Code or Codex — one click each",
  blurb = "Click anything — it runs live in your browser.",
  lesson = "sixty-seconds",
  posterPriority = false,
}: PageDemo & { posterPriority?: boolean }) {
  const headingId = useId();
  return (
    <section
      id="demo"
      aria-labelledby={headingId}
      className="scroll-mt-20 pb-16 sm:pb-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:max-w-7xl">
        <DemoCaption
          heading={heading}
          blurb={blurb}
          lesson={lesson}
          headingId={headingId}
        />
        <div data-nosnippet>
          <DemoStage
            tour={tour}
            lesson={lesson}
            posterPriority={posterPriority}
          />
        </div>
      </div>
    </section>
  );
}
