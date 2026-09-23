import type { Metadata } from "next";
import { PairedDevices } from "@/components/home/paired-devices";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  LINUX_HOST_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
  REVIEW_CHANGES_PATH,
  TOKEN_USAGE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  iosAppJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import Composer from "./_components/composer";
import Control from "./_components/control";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import MoreOnPhone from "./_components/more-on-phone";
import Notifications from "./_components/notifications";
import Problem from "./_components/problem";
import ReviewShip from "./_components/review-ship";
import Security from "./_components/security";
import VsRemoteControl from "./_components/vs-remote-control";

const TITLE = "Control Claude Code on Your Mac From Your iPhone";
const DESCRIPTION =
  "Pair your iPhone with lpm on your Mac to drive Claude Code and Codex in a live terminal, review diffs, commit and push, and get encrypted alerts.";
const APP_DESCRIPTION =
  "The lpm companion for iPhone and iPad: live terminals from your Mac or Linux server, a prompt composer, git review and commits, automations, usage limits, and encrypted agent alerts.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "claude code iphone",
    "claude code mobile",
    "remote claude code",
    "control claude code from phone",
    "control claude code from iphone",
    "ai agent mac terminal",
    "mac terminal on iphone",
    "run ai agents from phone",
    "review git diff on phone",
    "commit and push from iphone",
    "ios terminal companion app",
    "remote terminal iphone",
    "monitor ai agents from phone",
    "claude code notification when finished",
    "run codex from iphone",
    "claude code usage limit iphone",
    "schedule claude code from iphone",
    "lpm link",
  ],
  alternates: {
    canonical: MOBILE_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Drive Claude Code, Codex, or any terminal agent from your iPhone or iPad: live terminals, a full prompt composer, git review and shipping, automations, usage limits, and encrypted alerts.",
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
    about: [
      "Claude Code on iPhone",
      "Codex on iPhone",
      "remote control for AI coding agents",
      "iOS terminal companion app",
      "git review on iPhone",
    ],
  }),
  iosAppJsonLd({ description: APP_DESCRIPTION }),
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
      <PairedDevices companionLink={false} flush />
      <Problem />
      <VsRemoteControl />
      <Features />
      <Composer />
      <ReviewShip />
      <Control />
      <MoreOnPhone />
      <Notifications />
      <HowItWorks />
      <Security />
      <Faq />
      <RelatedPages
        links={[
          {
            href: LINUX_HOST_PATH,
            title: "Run Claude Code on a remote server",
            description:
              "Put long runs on a Linux box that never sleeps, then pair your phone with it directly.",
          },
          {
            href: TOKEN_USAGE_PATH,
            title: "Claude Code & Codex usage and limits",
            description:
              "The 5-hour and weekly meters and token stats your phone shows, full-size on the Mac.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Set up prompts that run on a schedule, then read and reply to each run from your phone.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Send one prompt to several fresh copies of a project and keep the best result.",
          },
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
        ]}
      />
      <Cta />
    </>
  );
}
