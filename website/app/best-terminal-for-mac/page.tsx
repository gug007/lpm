import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  BEST_TERMINAL_MAC_PATH,
  GIT_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import WhyMac from "./_components/why-mac";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Best Terminal for Mac — Native Apple Silicon Workspace",
  description:
    "lpm is the best terminal for Mac — a native Apple Silicon app with live output per service, a visual project switcher, and no Electron bloat.",
  keywords: [
    "best terminal for mac",
    "best terminal for macos",
    "best terminal for mac developers",
    "best terminal for mac m1",
    "best free terminal for mac",
    "native mac terminal",
  ],
  alternates: {
    canonical: BEST_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "Best Terminal for Mac — Native Apple Silicon Workspace",
    description:
      "A native macOS terminal workspace. Run every service side by side, switch projects visually, and skip the Electron bloat of Hyper or Tabby.",
    type: "website",
    url: BEST_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Terminal for Mac — Native Apple Silicon Workspace",
    description:
      "A native macOS terminal workspace. Run every service side by side, switch projects visually, and skip the Electron bloat.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Best Terminal for Mac — Native Apple Silicon Workspace",
    description:
      "lpm is the best terminal for Mac — a native Apple Silicon app with live output per service, a visual project switcher, and no Electron bloat.",
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
      <WhyMac />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
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
        ]}
      />
      <Cta />
    </>
  );
}
