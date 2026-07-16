"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Terminal } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { useInView } from "@/components/config/playground/hooks";

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
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-[#1a1a1a] px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#2e2e2e] bg-[#242424] text-[#b3b3b3]">
        <Terminal className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="text-sm font-semibold text-[#e5e5e5]">
        The live demo runs on desktop
      </div>
      <p className="max-w-xs text-[13px] leading-relaxed text-[#919191]">
        lpm is a macOS app with a multi-pane terminal workspace. Open this page
        on your computer to try the interactive demo.
      </p>
    </div>
  );
}

function DemoStage() {
  const [isDesktop, setIsDesktop] = useState(false);
  const { ref, inView } = useInView<HTMLDivElement>("600px 0px");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  return (
    <>
      <div className="sm:hidden">
        <DesktopOnlyPrompt />
      </div>
      <div ref={ref} className="hidden sm:block">
        {isDesktop && inView ? (
          <DemoApp
            heightCss={DEMO_HEIGHT_DESKTOP}
            heightCssSm={DEMO_HEIGHT_DESKTOP}
          />
        ) : (
          <DemoPlaceholder />
        )}
      </div>
    </>
  );
}

export function DemoSection() {
  return (
    <section
      id="demo"
      aria-label="Live interactive demo"
      className="scroll-mt-20 py-16 sm:py-20"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <SectionHeader
          eyebrow={
            <span
              className="inline-flex items-center gap-1.5"
              aria-label="Interactive demo, click to try"
            >
              <span
                className="relative inline-flex h-1.5 w-1.5"
                aria-hidden="true"
              >
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Live interactive demo
            </span>
          }
          title="Projects, terminals, agents, a built-in browser — one click each"
          description="Click anywhere below. Switch projects, start services, launch Claude Code or Codex, and preview your dev server in the in-pane browser — all running live in your browser, right now."
          className="mb-10"
        />
        <DemoStage />
      </div>
    </section>
  );
}
