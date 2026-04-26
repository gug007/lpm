"use client";

import dynamic from "next/dynamic";
import { SectionHeader } from "@/components/section-header";

const DemoApp = dynamic(
  () => import("@/components/demo/demo-app").then((m) => m.DemoApp),
  {
    ssr: false,
    loading: () => (
      <div
        className="flex items-center justify-center rounded-xl border border-gray-200 dark:border-[#2e2e2e] bg-[#1a1a1a] text-[11px] text-gray-400"
        style={{ height: "min(560px, 70vh)" }}
      >
        Loading demo…
      </div>
    ),
  },
);

export function DemoSection() {
  return (
    <section id="demo" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <SectionHeader
          eyebrow="Interactive demo"
          title="Projects, terminals, Claude Code or Codex — one click each"
          description="Switch projects, start services, launch Claude Code or Codex — all from one native macOS app. Try it right in your browser."
          className="mb-10"
        />
        <DemoApp heightCss="min(560px, 70vh)" />
      </div>
    </section>
  );
}
