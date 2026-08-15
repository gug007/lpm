import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import { ComparisonBasis } from "@/components/vs/comparison-basis";
import {
  BEST_TERMINAL_MAC_PATH,
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
import WhyMac from "./_components/why-mac";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Best Terminal for Mac in 2026 — Native, No Electron",
  description:
    "A native Apple Silicon terminal that runs your whole dev stack in one window — live logs per service, one-click project switching, and AI agents alongside.",
  keywords: [
    "best terminal for mac",
    "best terminal for macos",
    "mac terminal app",
    "best terminal for mac m1",
    "best free terminal for mac",
    "native mac terminal",
  ],
  alternates: {
    canonical: BEST_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "Best Terminal for Mac in 2026 — Native, No Electron",
    description:
      "A native Apple Silicon terminal that runs your whole dev stack in one window — live logs per service, one-click project switching, and AI agents alongside.",
    type: "website",
    url: BEST_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Terminal for Mac in 2026 — Native, No Electron",
    description:
      "A native Apple Silicon terminal that runs your whole dev stack in one window — live logs per service, one-click project switching, and AI agents alongside.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Best Terminal for Mac in 2026 — Native, No Electron",
    description:
      "A native Apple Silicon terminal that runs your whole dev stack in one window — live logs per service, one-click project switching, and AI agents alongside.",
    path: BEST_TERMINAL_MAC_PATH,
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
      <DemoSection />
      <ComparisonBasis
        reviewed="August 13, 2026"
        sources={[
          {
            href: "https://iterm2.com/features.html",
            label: "iTerm2's official feature list",
          },
          {
            href: "https://github.com/warpdotdev/warp/discussions/9240",
            label: "Warp's open-source announcement",
          },
        ]}
      />
      <WhyMac />
      <Features />
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
              "Run your whole stack — services, logs, and agents — in one native Mac app.",
          },
          {
            href: GIT_TERMINAL_MAC_PATH,
            title: "Git terminal for Mac",
            description:
              "Branch, rebase, and ship while your dev servers stream in the same window.",
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
        ]}
      />
      <Cta />
    </>
  );
}
