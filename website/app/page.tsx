import type { Metadata } from "next";
import { BeforeAfter } from "@/components/home/before-after";
import { ConfigExample } from "@/components/home/config-example";
import { CtaBand } from "@/components/home/cta-band";
import { DemoSection } from "@/components/home/demo";
import { DownloadSafety } from "@/components/home/download-safety";
import { Downloads } from "@/components/home/downloads";
import { Features } from "@/components/home/features";
import { Hero } from "@/components/home/hero";
import { HomeFaq } from "@/components/home/home-faq";
import { HowItWorks } from "@/components/home/how-it-works";
import { PairedDevices } from "@/components/home/paired-devices";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  CLAUDE_ACCOUNTS_PATH,
  TOKEN_USAGE_PATH,
  vsPath,
} from "@/lib/links";
import { jsonLdString, screenRecordingJsonLd } from "@/lib/structured-data";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

const structuredData = [
  screenRecordingJsonLd("add-project"),
  screenRecordingJsonLd("start-project"),
  screenRecordingJsonLd("add-action"),
  screenRecordingJsonLd("run-profile-project"),
  screenRecordingJsonLd("start-project-claude"),
  screenRecordingJsonLd("duplicate-project"),
];

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection />
      <BeforeAfter />
      <HowItWorks />
      <CtaBand />
      <Features />
      <PairedDevices />
      <ConfigExample />
      <HomeFaq />
      <RelatedPages
        links={[
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "A native Apple Silicon workspace with live output per service and a visual project switcher.",
          },
          {
            href: CLAUDE_ACCOUNTS_PATH,
            title: "Multiple Claude Code accounts",
            description:
              "Pin a Claude account to each project — work and personal run in parallel, signed in once.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Run Claude Code and Codex side by side on the same codebase and keep every agent in view.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex token usage",
            description:
              "Track tokens, approximate cost, cache usage, projects, models, and sessions locally on your Mac.",
          },
          {
            href: vsPath("tmux"),
            title: "lpm vs tmux",
            description:
              "An honest comparison of lpm and tmux for running local dev stacks with services in panes.",
          },
        ]}
      />
      <Downloads>
        <DownloadSafety />
      </Downloads>
    </>
  );
}
