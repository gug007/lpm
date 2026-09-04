"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AutoVideo } from "@/components/auto-video";
import { useInView } from "@/components/config/playground/hooks";
import { DownloadLink } from "@/components/download-link";
import { MOBILE_PATH } from "@/lib/links";

// A real lpm window is 960×640; the stage is capped at 1040px wide (see
// DemoStage) so the demo keeps the app's 3:2 proportions instead of squatting.
const DEMO_HEIGHT_DESKTOP = "min(694px, 76vh)";

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
        <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wider text-[#5c5c5c]">
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
          <span className="text-[13px] text-[#5c5c5c]">Loading demo…</span>
        </div>
      </div>
    </div>
  );
}

function DesktopOnlyPrompt() {
  return (
    <div data-on-dark className={WINDOW_FRAME}>
      <AutoVideo
        src="/screenrecording/start-project-claude.mp4"
        poster="/screenrecording/start-project-claude-poster.jpg"
        label="lpm starting a project's services, then handing the project to Claude Code in a terminal tab"
        className="h-auto w-full"
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

function DemoStage() {
  // null until the media query is read on the client. While null, both shells
  // stay mounted and CSS picks the visible one, so the first paint matches the
  // server HTML at every width (hidden subtrees don't fetch their media); once
  // detection resolves, the losing subtree unmounts entirely.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const { ref, inView } = useInView<HTMLDivElement>("600px 0px");
  const idle = useIdle();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div ref={ref} className="mx-auto max-w-[1040px]">
      {isDesktop !== true && (
        <div className={isDesktop === null ? "md:hidden" : undefined}>
          <DesktopOnlyPrompt />
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
          {isDesktop && inView && idle ? (
            <DemoApp
              heightCss={DEMO_HEIGHT_DESKTOP}
              heightCssSm={DEMO_HEIGHT_DESKTOP}
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
      )}
    </div>
  );
}

function DemoCaption() {
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
        <h2 className="text-balance text-lg font-bold tracking-tight sm:text-xl">
          Projects, terminals, agents, a built-in browser — one click each
        </h2>
      </div>
      <p className="max-w-md text-pretty text-[13px] leading-relaxed text-gray-500 lg:max-w-none lg:whitespace-nowrap lg:text-right dark:text-gray-400">
        <span className="md:hidden">
          A recording of lpm booting a project and handing it to Claude Code —
          lpm is a macOS app, so the clickable demo runs on desktop.
        </span>
        <span className="hidden md:inline">
          Click anything — it runs live in your browser.
        </span>
      </p>
    </div>
  );
}

export function DemoSection() {
  return (
    <section
      id="demo"
      aria-label="Live interactive demo"
      className="scroll-mt-20 pb-16 sm:pb-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <DemoCaption />
        <div data-nosnippet>
          <DemoStage />
        </div>
      </div>
    </section>
  );
}
