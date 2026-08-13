"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AutoVideo } from "@/components/auto-video";
import { SectionHeader } from "@/components/section-header";
import { useInView } from "@/components/config/playground/hooks";
import { MOBILE_PATH } from "@/lib/links";

const DEMO_HEIGHT_DESKTOP = "min(560px, 70vh)";

const DemoApp = dynamic(
  () => import("@/components/demo/demo-app").then((m) => m.DemoApp),
  {
    ssr: false,
    loading: () => <DemoPlaceholder />,
  },
);

function DemoPlaceholder() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-[#1a1a1a] h-[var(--demo-h)]"
      style={{ "--demo-h": DEMO_HEIGHT_DESKTOP } as React.CSSProperties}
    >
      <Image
        src="/screenrecording/agent-parallel-tabs-poster.jpg"
        alt="lpm project view on macOS: a sidebar of projects, one-click agent buttons in the header, and a Claude Code session running in a terminal tab"
        width={1224}
        height={754}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-3">
        <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] text-gray-300">
          Loading demo…
        </span>
      </div>
    </div>
  );
}

function DesktopOnlyPrompt() {
  return (
    <div
      data-on-dark
      className="overflow-hidden rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-[#1a1a1a] shadow-2xl shadow-gray-200/60 dark:shadow-black/60"
    >
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
        <Link
          href="/#download"
          className="rounded-lg bg-white px-4 py-2 text-[13px] font-medium text-gray-900 transition-opacity hover:opacity-85"
        >
          Get lpm for Mac
        </Link>
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

function DemoStage() {
  // null until the media query is read on the client. While null, both shells
  // stay mounted and CSS picks the visible one, so the first paint matches the
  // server HTML at every width (hidden subtrees don't fetch their media); once
  // detection resolves, the losing subtree unmounts entirely.
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);
  const { ref, inView } = useInView<HTMLDivElement>("600px 0px");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <div ref={ref}>
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
          {isDesktop && inView ? (
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
            <Link
              href="/#download"
              className="underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:decoration-gray-600 dark:hover:text-white"
            >
              Get lpm for Mac
            </Link>{" "}
            and point it at your own projects.
          </p>
        </div>
      )}
    </div>
  );
}

export function DemoSection() {
  return (
    <section
      id="demo"
      aria-label="Live interactive demo"
      className="scroll-mt-20 pt-10 sm:pt-14 pb-16 sm:pb-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
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
          }
          title="Projects, terminals, agents, a built-in browser — one click each"
          description={
            <>
              <span className="md:hidden">
                Watch lpm boot a project&apos;s services and hand it straight to
                Claude Code. The demo below is a recording — lpm is a macOS app,
                so the clickable version runs on desktop.
              </span>
              <span className="hidden md:inline">
                Click anywhere below. Switch projects, start services, launch
                Claude Code or Codex, and preview your dev server in the in-pane
                browser — all running live in your browser, right now.
              </span>
            </>
          }
          className="mb-10"
        />
        <div data-nosnippet>
          <DemoStage />
        </div>
      </div>
    </section>
  );
}
