"use client";

import dynamic from "next/dynamic";
import { SectionHeader } from "@/components/section-header";

const DEMO_HEIGHT_MOBILE = "min(520px, calc(100vh - 140px))";
const DEMO_HEIGHT_DESKTOP = "min(560px, 70vh)";

const DemoApp = dynamic(
  () => import("@/components/demo/demo-app").then((m) => m.DemoApp),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-[#1a1a1a] text-[11px] text-gray-400 h-[var(--demo-h)] sm:h-[var(--demo-h-sm)]"
        style={
          {
            "--demo-h": DEMO_HEIGHT_MOBILE,
            "--demo-h-sm": DEMO_HEIGHT_DESKTOP,
          } as React.CSSProperties
        }
      >
        Loading demo…
      </div>
    ),
  },
);

export function DemoSection() {
  return (
    <section
      id="demo"
      aria-label="Live interactive demo"
      className="scroll-mt-20 py-16 sm:py-20"
    >
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
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
        <DemoApp
          heightCss={DEMO_HEIGHT_MOBILE}
          heightCssSm={DEMO_HEIGHT_DESKTOP}
        />
      </div>
    </section>
  );
}
