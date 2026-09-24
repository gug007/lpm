import type { Metadata } from "next";
import { DemoSection } from "@/components/home/demo";
import { RelatedPages } from "@/components/related-pages";
import {
  PARALLEL_PATH,
  REVIEW_CHANGES_PATH,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";
import Alternatives from "./_components/alternatives";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import { WORKTREE_ALT_DEMO } from "./_components/demo-tour";
import FactsChecked from "./_components/facts-checked";
import Faq from "./_components/faq";
import { FAQ_ITEMS } from "./_components/faq-data";
import Hero from "./_components/hero";
import HowItWorks from "./_components/how-it-works";
import MidCta from "./_components/mid-cta";
import WhatComesAlong from "./_components/what-comes-along";
import WhenToUse from "./_components/when-to-use";

const TITLE = "Git Worktree Alternatives: Clone, Copy or Duplicate";
const DESCRIPTION =
  "Git worktree alternatives compared: git clone, copy-on-write copies, containers and lpm Duplicate, which brings .env, node_modules and uncommitted work.";
const SHARE_TITLE = "More than a Git worktree: copy the whole project";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "git worktree alternative",
    "git worktree alternatives",
    "alternative to git worktree",
    "git worktree vs clone",
    "git worktree vs git clone",
    "git worktree vs copy",
    "git worktree limitations",
    "git worktree disadvantages",
    "copy git repo with node_modules",
    "apfs clone git repository",
    "copy-on-write project copy",
    "claude code worktree alternative",
    "two agents same branch",
    "standalone project copies",
  ],
  alternates: {
    canonical: WORKTREE_ALTERNATIVE_PATH,
  },
  openGraph: {
    title: SHARE_TITLE,
    description:
      "Worktrees check out committed files. lpm Duplicate copies the project you have now, with .env, node_modules and uncommitted work, and can start an agent in it.",
    type: "website",
    url: WORKTREE_ALTERNATIVE_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: SHARE_TITLE,
    description:
      "Git worktree vs git clone vs a full project copy: what each one carries, and when a copy with your .env and dependencies is the better call.",
  },
};

const structuredData = [
  webPageJsonLd({
    title: TITLE,
    description: DESCRIPTION,
    path: WORKTREE_ALTERNATIVE_PATH,
    about: [
      "Git worktree alternatives",
      "Git worktree limitations",
      "git clone",
      "APFS copy-on-write clones",
      "standalone project copies",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    {
      name: "Git Worktree Alternatives",
      path: WORKTREE_ALTERNATIVE_PATH,
    },
  ]),
  faqJsonLd(FAQ_ITEMS),
  youtubeLessonJsonLd("parallel-agents"),
];

export default function GitWorktreeAlternativePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <Hero />
      <WhatComesAlong />
      <DemoSection {...WORKTREE_ALT_DEMO} />
      <Alternatives />
      <Comparison />
      <FactsChecked />
      <HowItWorks />
      <MidCta />
      <WhenToUse />
      <Faq />
      <RelatedPages
        links={[
          {
            href: WORKTREE_AGENTS_PATH,
            title: "Git worktrees for Claude Code and Codex",
            description:
              "What a worktree does not carry, what the agents create natively and all five isolation models compared.",
          },
          {
            href: PARALLEL_PATH,
            title: "Run Claude Code in parallel",
            description:
              "Fan one prompt out to several copies, watch each agent's status, then keep the diff that works.",
          },
          {
            href: REVIEW_CHANGES_PATH,
            title: "Review agent changes",
            description:
              "Inspect every changed file and diff before you commit the result from a parallel agent run.",
          },
        ]}
      />
      <Cta />
    </>
  );
}
