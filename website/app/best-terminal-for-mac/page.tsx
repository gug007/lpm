import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  FEATURES_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  PROJECT_SIDEBAR_PATH,
  vsPath,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Landscape from "./_components/landscape";
import QuickPicks from "./_components/quick-picks";
import TerminalBasics from "./_components/terminal-basics";
import WhyMac from "./_components/why-mac";
import Workflows from "./_components/workflows";
import { MAC_TERMINAL_DEMO } from "./_components/demo-tour";

const TITLE = "Best Terminal for Mac (2026): 8 Free Apps Compared";
const DESCRIPTION =
  "Ghostty, iTerm2, Warp, WezTerm, Kitty, Alacritty, Terminal.app and lpm compared: who each suits, what it costs, and the free Mac terminal that runs projects.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "best terminal for mac",
    "best terminal for macos",
    "best terminal app for mac",
    "best mac terminal 2026",
    "best free terminal for mac",
    "ghostty vs iterm2",
    "iterm2 alternative",
    "native mac terminal",
  ],
  alternates: {
    canonical: BEST_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: BEST_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: BEST_TERMINAL_MAC_PATH,
    about: [
      "best terminal for Mac",
      "free native Mac terminal",
      "Apple silicon terminal app",
      "terminal with split panes and project sidebar",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Best Terminal for Mac", path: BEST_TERMINAL_MAC_PATH },
  ]),
];

export default function BestTerminalForMacPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <QuickPicks />
      <ComparisonBasis
        reviewed="October 28, 2026"
        reviewedIso="2026-10-28"
        sources={[
          { href: "https://ghostty.org/docs/about", label: "Ghostty" },
          {
            href: "https://iterm2.com/features.html",
            label: "iTerm2 features",
          },
          { href: "https://www.warp.dev/pricing", label: "Warp pricing" },
          {
            href: "https://github.com/warpdotdev/warp/discussions/9240",
            label: "Warp's open-source announcement",
          },
          { href: "https://wezterm.org/", label: "WezTerm" },
          {
            href: "https://sw.kovidgoyal.net/kitty/overview/",
            label: "Kitty overview",
          },
          {
            href: "https://github.com/alacritty/alacritty",
            label: "Alacritty",
          },
          {
            href: "https://support.apple.com/guide/terminal/welcome/mac",
            label: "Terminal User Guide",
          },
        ]}
      />
      <DemoSection {...MAC_TERMINAL_DEMO} />
      <WhyMac />
      <Features />
      <TerminalBasics />
      <Benefits />
      <Workflows />
      <Comparison />
      <Landscape />
      <Faq />
      <RelatedPages
        links={[
          {
            href: MAC_TERMINAL_DEVELOPERS_PATH,
            title: "Mac terminal for developers",
            description:
              "Services, logs and agents for the whole stack, inside one native Mac app.",
          },
          {
            href: GIT_TERMINAL_MAC_PATH,
            title: "Git terminal for Mac",
            description:
              "Git work next to live dev-server output, in one window.",
          },
          {
            href: PROJECT_SIDEBAR_PATH,
            title: "Terminal with a project sidebar",
            description:
              "What replaces the tab row: one persistent row per project, holding its terminals and running state.",
          },
          {
            href: vsPath("iterm2"),
            title: "lpm vs iTerm2",
            description:
              "Side by side with the Mac terminal you already have open — including where iTerm2 still wins.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code and Codex",
            description:
              "Claude Code and Codex status, needs-you alerts and plan limits at a glance.",
          },
          {
            href: FEATURES_PATH,
            title: "Every lpm feature",
            description:
              "Every lpm feature, area by area.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
