import type { Metadata } from "next";
import { RelatedPages } from "@/components/related-pages";
import {
  AI_AGENTS_PATH,
  AUTOMATIONS_PATH,
  CONFIG_PATH,
  FEATURES_PATH,
  LINUX_HOST_PATH,
  MOBILE_PATH,
  PARALLEL_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import AreaSection from "./_components/area-section";
import { AREA_VISUALS } from "./_components/area-visuals";
import { AREAS } from "./_components/areas";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import { FEATURE_AREAS } from "./_components/feature-areas";
import Hero from "./_components/hero";
import IphoneCallout from "./_components/iphone-callout";
import JumpNav from "./_components/jump-nav";
import Requirements from "./_components/requirements";

const TITLE = "Features: Dev Servers, Claude Code & Codex on Mac";
const DESCRIPTION =
  "What lpm does, on one page: dev servers, terminals, live Claude Code and Codex status, parallel copies, Git review, automations, and control from iPhone.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "lpm features",
    "Claude Code Mac app",
    "Codex Mac app",
    "Claude Code terminal",
    "run Claude Code in parallel",
    "schedule Claude Code tasks",
    "run multiple dev servers on Mac",
    "Claude Code on iPhone",
  ],
  alternates: {
    canonical: FEATURES_PATH,
  },
  openGraph: {
    title: TITLE,
    description:
      "Projects and dev servers, Claude Code and Codex terminals with live status, parallel copies, Git review, automations, and iPhone control, all on one page.",
    type: "website",
    url: FEATURES_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description:
      "What lpm does: dev servers, Claude Code and Codex terminals, parallel copies, Git review, automations, and iPhone control.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: FEATURES_PATH,
    about: [
      "lpm features",
      "Claude Code",
      "Codex",
      "local dev servers",
      "parallel AI coding agents",
      "Git review",
      "scheduled agent tasks",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Features", path: FEATURES_PATH },
  ]),
];

export default function FeaturesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <div>
        <JumpNav />
        {FEATURE_AREAS.map((area, index) => {
          const meta = AREAS.find(({ id }) => id === area.id);
          if (!meta) return null;
          return (
            <AreaSection
              key={area.id}
              area={area}
              meta={meta}
              tinted={index % 2 === 1}
              visual={AREA_VISUALS[area.id]}
            >
              {area.id === "iphone" && <IphoneCallout />}
            </AreaSection>
          );
        })}
        <Requirements />
      </div>
      <Faq />
      <RelatedPages
        links={[
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Duplicates, worktrees, and one prompt sent to up to ten copies at once.",
          },
          {
            href: AUTOMATIONS_PATH,
            title: "Schedule Claude Code tasks",
            description:
              "Recurring agent prompts, commands, and actions with run history and replies.",
          },
          {
            href: AI_AGENTS_PATH,
            title: "Best terminal for Claude Code & Codex",
            description:
              "Live agent status, alerts, and a prompt composer right next to your services.",
          },
          {
            href: MOBILE_PATH,
            title: "lpm link for iPhone",
            description:
              "Mirror terminals, send prompts, and get push alerts from your phone.",
          },
          {
            href: LINUX_HOST_PATH,
            title: "Run Claude Code on a remote server",
            description:
              "Add a Linux host with one SSH string and keep agents running after your Mac closes.",
          },
          {
            href: CONFIG_PATH,
            title: "Configuration docs",
            description:
              "Every field for services, actions, profiles, and terminals, with examples.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
