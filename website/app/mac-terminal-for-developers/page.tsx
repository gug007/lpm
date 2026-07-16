import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  BEST_TERMINAL_MAC_PATH,
  MAC_TERMINAL_DEVELOPERS_PATH,
  SSH_TERMINAL_MAC_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "Mac Terminal for Developers — Run Your Full Stack",
  description:
    "lpm is a Mac terminal built for developers — launch your full stack in one window, track per-service logs, and switch between repos without losing context.",
  keywords: [
    "mac terminal for developers",
    "terminal for mac developers",
    "developer terminal mac",
    "mac terminal for web developers",
    "run multiple services mac terminal",
    "mac dev environment terminal",
  ],
  alternates: {
    canonical: MAC_TERMINAL_DEVELOPERS_PATH,
  },
  openGraph: {
    title: "Mac Terminal for Developers — Run Your Full Stack",
    description:
      "Launch every service in your stack from one Mac terminal window. Per-service logs, instant project switching, and native Apple Silicon performance.",
    type: "website",
    url: MAC_TERMINAL_DEVELOPERS_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mac Terminal for Developers — Run Your Full Stack",
    description:
      "A Mac terminal workspace for developers. Run every service side by side, switch repos without losing context, and coordinate AI agents.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "Mac Terminal for Developers — Run Your Full Stack",
    description:
      "lpm is a Mac terminal built for developers — launch your full stack in one window, track per-service logs, and switch between repos without losing context.",
    path: MAC_TERMINAL_DEVELOPERS_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Mac Terminal for Developers", path: MAC_TERMINAL_DEVELOPERS_PATH },
  ]),
];

export default function MacTerminalForDevelopersPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <DemoSection />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <RelatedPages
        links={[
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "Why a native Apple Silicon workspace beats Electron terminals and tab strips.",
          },
          {
            href: SSH_TERMINAL_MAC_PATH,
            title: "SSH terminal for Mac",
            description:
              "Remote dev boxes, port forwarding, and your local stack in one window.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
