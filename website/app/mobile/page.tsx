import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  BEST_TERMINAL_MAC_PATH,
  MOBILE_PATH,
  REVIEW_CHANGES_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";
import Composer from "./_components/composer";
import Control from "./_components/control";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import Notifications from "./_components/notifications";
import Problem from "./_components/problem";
import ReviewShip from "./_components/review-ship";
import Security from "./_components/security";

const TITLE = "Control Claude Code, Codex & More From Your iPhone";
const DESCRIPTION =
  "Pair your iPhone with lpm on your Mac to steer Claude Code and Codex, review diffs, commit, push, or open a PR, and get encrypted alerts when an agent is waiting.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "control claude code from phone",
    "control claude code from iphone",
    "review git diff on phone",
    "commit and push from iphone",
    "ios terminal companion app",
    "remote terminal iphone",
    "monitor ai agents from phone",
    "claude code notification when finished",
    "run codex from iphone",
  ],
  alternates: {
    canonical: MOBILE_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Run Claude Code, Codex, or any AI agent from your iPhone or iPad: a live terminal mirror, a full prompt composer, git review and shipping, and encrypted alerts when an agent needs you.",
    type: "website",
    url: MOBILE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "A live mirror of your Mac terminals on your phone. Prompt agents, review diffs, commit and push, and get an encrypted alert the moment an agent is waiting.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
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
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <Problem />
      <Features />
      <Composer />
      <ReviewShip />
      <Control />
      <Notifications />
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
              "The same diff review you get on your phone, full-size on your Mac.",
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
