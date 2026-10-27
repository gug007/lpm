import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  FEATURES_PATH,
  LINUX_HOST_PATH,
  MAC_MINI_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import ComeBack from "./_components/come-back";
import Compare from "./_components/compare";
import Cta from "./_components/cta";
import Faq, { FAQ_ITEMS } from "./_components/faq";
import Hero from "./_components/hero";
import Lesson from "./_components/lesson";
import PairDemo from "./_components/pair-demo";
import PairWays from "./_components/pair-ways";
import Phone from "./_components/phone";
import QuickAnswer from "./_components/quick-answer";
import Sessions from "./_components/sessions";
import Setup from "./_components/setup";
import SyncLesson from "./_components/sync-lesson";

const TITLE = "Run Claude Code & Codex on a Mac mini";
const DESCRIPTION =
  "Start Claude Code and Codex on a Mac mini from your laptop. They keep working when you close the lid, and lpm shows each one Done when you're back.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "run claude code on a mac mini",
    "codex on a mac mini",
    "mac mini for claude code",
    "claude code on another mac",
    "run codex on another mac",
    "long claude code runs",
    "start claude code on a mac mini from my laptop",
    "claude code and codex on a home mac",
    "answer claude code from iphone",
    "mac mini vs vps for claude code",
    "claude code mac mini tailscale",
  ],
  alternates: {
    canonical: MAC_MINI_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Start Claude Code and Codex in a Mac mini project from your laptop. They run with the Mac mini's sign-ins, keep working with your laptop shut, and wait for you marked Done.",
    type: "website",
    url: MAC_MINI_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "Long Claude Code and Codex runs belong on the Mac that stays home. Start them from your laptop, close the lid, come back to Done.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: MAC_MINI_PATH,
    about: [
      "running Claude Code on a Mac mini",
      "running Codex on a Mac mini",
      "starting Claude Code and Codex on another Mac from a laptop",
      "long Claude Code and Codex sessions on an always-on Mac",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Run Claude Code & Codex on a Mac mini", path: MAC_MINI_PATH },
  ]),
  faqJsonLd(FAQ_ITEMS),
  youtubeLessonJsonLd("keep-agents-running-on-server"),
  youtubeLessonJsonLd("sync-ignored-files"),
];

export default function RunOnMacMiniPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <PairDemo />
      <QuickAnswer />
      <Lesson />
      <Sessions />
      <ComeBack />
      <Phone />
      <PairWays />
      <Setup />
      <SyncLesson />
      <Compare />
      <Faq />
      <RelatedPages
        links={[
          {
            href: LINUX_HOST_PATH,
            title: "Run Claude Code on a Linux server",
            description:
              "Rent a box instead: type what you would type after ssh, and lpm installs itself there and starts on boot.",
          },
          {
            href: MOBILE_PATH,
            title: "Your agents on your iPhone",
            description:
              "Pair lpm Link with the Mac mini and answer Claude Code or Codex with your laptop shut.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Automations on the Mac mini's projects run there, overnight included, while lpm is open.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Send one prompt to several copies of a project and compare what comes back.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Agents, services and logs side by side in one project window.",
          },
          {
            href: FEATURES_PATH,
            title: "Everything lpm does",
            description:
              "Projects, terminals, agents, Git and other computers: the full feature list in one place.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
