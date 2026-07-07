import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  MOBILE_PATH,
  REVIEW_CHANGES_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/structured-data";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import Problem from "./_components/problem";
import Security from "./_components/security";

export const metadata: Metadata = {
  title: "lpm for iPhone — Control Your Terminals & AI Agents Remotely",
  description:
    "The lpm iOS companion pairs with lpm on your Mac and mirrors your terminals live. Type into running Claude Code and Codex agents, start and stop projects, and know the moment an agent is waiting — from anywhere.",
  keywords: [
    "control claude code from phone",
    "ios terminal companion app",
    "remote terminal iphone",
    "mobile dev terminal",
    "monitor ai agents from phone",
    "control mac terminal from iphone",
  ],
  alternates: {
    canonical: MOBILE_PATH,
  },
  openGraph: {
    title: "lpm for iPhone — Control Your Terminals & AI Agents Remotely",
    description:
      "Pair your iPhone with lpm on your Mac and get a live mirror of every terminal. Answer agents, start projects, and stay in the loop from anywhere.",
    type: "website",
    url: MOBILE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm for iPhone — Control Your Terminals & AI Agents Remotely",
    description:
      "A live mirror of your Mac terminals on your phone. Type into running agents, start projects, and never miss a waiting agent.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: "lpm for iPhone — Control Your Terminals & AI Agents Remotely",
    description:
      "The lpm iOS companion pairs with lpm on your Mac and mirrors your terminals live. Type into running Claude Code and Codex agents, start and stop projects, and know the moment an agent is waiting — from anywhere.",
    path: MOBILE_PATH,
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "lpm for iPhone", path: MOBILE_PATH },
  ]),
];

export default function MobilePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <Security />
      <Faq />
      <RelatedPages
        links={[
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Why lpm is the desktop home for the AI coding agents your phone controls.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review changes in your terminal",
            description:
              "See and review what your agents changed without leaving the app.",
          },
          {
            href: BEST_TERMINAL_MAC_PATH,
            title: "Best terminal for Mac",
            description:
              "The native Apple Silicon workspace the companion mirrors to your phone.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
