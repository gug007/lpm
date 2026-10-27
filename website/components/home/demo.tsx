"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useInView } from "@/components/config/playground/hooks";
import {
  HOME_TOUR,
  type Tour,
  type TourHandle,
  type TourState,
} from "@/components/home/tour";
import { DownloadLink } from "@/components/download-link";
import { DemoCaption } from "@/components/home/demo-caption";
import { DemoFrame } from "@/components/home/demo-frame";
import { lessonPoster } from "@/components/home/lesson-data";
import { DemoSkeleton } from "@/components/home/demo-skeleton";
import { DemoSteps } from "@/components/home/demo-steps";
import { WINDOW_FRAME } from "@/components/home/demo-window";
import { YouTubeVideo } from "@/components/youtube-video";
import { MOBILE_PATH } from "@/lib/links";
import type { YouTubeLessonId } from "@/lib/youtube-lessons";

// Set by .demo-stage in globals.css: capped where a 1040px stage keeps the
// app's 3:2 proportions.
const DEMO_HEIGHT_DESKTOP = "var(--demo-stage-h)";

// What a phone reads above the lesson it plays instead of the demo: a heading
// for that lesson, not for the tour it stands in for, and one line on what it
// shows.
const LESSON_CAPTION: Record<
  YouTubeLessonId,
  { heading: string; blurb: string }
> = {
  "connect-iphone": {
    heading: "Pair your iPhone once, use it from anywhere",
    blurb: "A short video: pair lpm Link, set up Built-in Tailscale, and run Claude Code from your phone.",
  },
  "create-an-automation": {
    heading: "Let an agent check your code while you're away",
    blurb: "A short video: set up an automation, then read what it found.",
  },
  "run-any-ai-coding-agent": {
    heading: "Claude Code and Codex built in, any other agent one click away",
    blurb: "A short video: add Cursor and omp, then run them side by side.",
  },
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
  "multiple-accounts": {
    heading: "A Claude account for each project, all signed in at once",
    blurb: "A short video: add a second account and switch a project to it when one runs low.",
  },
  "accounts-switching": {
    heading: "New Claude sessions move to the account with room",
    blurb: "A short video: add an account, give a project its own, and turn on switching.",
  },
  "codex-statusline": {
    heading: "Usage limits and context left, under the Codex prompt",
    blurb: "A short video: pick a Codex status line layout and open Codex again.",
  },
  "claude-statusline": {
    heading: "Usage limits and context left, under the Claude Code prompt",
    blurb: "A short video: pick a Claude Code status line and watch it fill in.",
  },
  "review-code-changes": {
    heading: "Read every change an agent made before you commit",
    blurb: "A short video: review Claude's edits, undo one file, commit the rest.",
  },
  "action-zones": {
    heading: "Group your buttons into zones, with layers to flip between",
    blurb: "A short video: start a zone from a button, add layers, and tidy the header.",
  },
  "auto-pull-complete-guide": {
    heading: "Your projects pull your teammates' commits by themselves",
    blurb: "A walkthrough: turn on auto pull, undo a pull, and see when it waits for your work.",
  },
  "dynamic-action-labels": {
    heading: "Buttons that show your last release, and update themselves",
    blurb: "A short video: put Git facts and a command's output in a label, and watch it change as the code does.",
  },
  "share-terminal-in-browser": {
    heading: "Share a terminal tab with anyone, right in their browser",
    blurb: "A short video: send an invite, let a teammate in from their browser, and let them type.",
  },
  "claude-code-codex-remote-server": {
    heading: "Run Claude Code and Codex on your own server",
    blurb: "A short video: set up a Linux host for many projects, or just SSH in to open one folder.",
  },
  "automations-that-ask-you-first": {
    heading: "Automations that ask before they decide",
    blurb: "A short video: an agent asks which release to make, you answer, and it carries on.",
  },
  "keep-agents-running-on-server": {
    heading: "Close the lid, come back to finished work",
    blurb: "A short video: start Claude Code and Codex on an always-on Mac, disconnect, and find both done.",
  },
  "run-agent-commands-in-one-click": {
    heading: "Run what your agent suggests in one click",
    blurb: "A short video: run the commands Claude Code and Codex suggest without copying them, and see risky ones ask first.",
  },
  "sync-ignored-files": {
    heading: "Your .env on every computer",
    blurb: "A short video: sync the files git ignores to another computer, compare .env files key by key, and keep them the same.",
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
        poster={lessonPoster(lesson)}
        fetchPriority={posterPriority ? "high" : undefined}
      />
      <div className="flex flex-col items-center gap-3 border-t border-[#2e2e2e] px-5 py-5 text-center">
        <p className="max-w-xs text-[13px] leading-relaxed text-[#919191]">
          lpm is a desktop app with a multi-pane terminal workspace. Open this
          page on your computer to try the interactive demo.
        </p>
        <DownloadLink className="rounded-lg bg-[#e5e5e5] px-4 py-2 text-[13px] font-medium text-[#1a1a1a] transition-all duration-100 hover:opacity-85 active:scale-[0.97]">
          Get lpm
        </DownloadLink>
        <Link
          href={MOBILE_PATH}
          className="text-[12px] text-[#919191] underline decoration-[#4a4a4a] underline-offset-4 transition-colors hover:text-white hover:decoration-current"
        >
          Or check your computers from your iPhone
        </Link>
      </div>
    </div>
  );
}

// The frame sits in the first viewport, so the observer fires on load. Waiting
// for an idle slot keeps the demo app's load off the critical path — the drawn
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
    <div ref={ref} className="demo-stage mx-auto max-w-[1040px]">
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
          <DemoSteps
            steps={script.steps}
            tour={tour}
            done={script.done}
            onRun={runStep}
            onRestart={restart}
          />
          {isDesktop && inView && idle ? (
            <DemoFrame
              key={demoRun}
              height={DEMO_HEIGHT_DESKTOP}
              tour={script}
              tourRef={tourRef}
              onTour={setTour}
              placeholder={<DemoSkeleton />}
            />
          ) : (
            <div
              className={WINDOW_FRAME}
              style={{ height: DEMO_HEIGHT_DESKTOP }}
            >
              <DemoSkeleton />
            </div>
          )}
          <div id="demo-next" tabIndex={-1} className="outline-none" />
        </div>
      )}
    </div>
  );
}

// What a page's demo shows: the tour it walks through (see the tours defined
// in components/home/tour.ts, or build one with defineTour), the caption above
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
  blurb = "Click a step to run it, or anything in the window. It all runs in your browser.",
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <DemoCaption
          heading={heading}
          blurb={blurb}
          phoneHeading={LESSON_CAPTION[lesson].heading}
          phoneBlurb={LESSON_CAPTION[lesson].blurb}
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
