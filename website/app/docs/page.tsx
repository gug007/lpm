import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { RelatedPages, type RelatedLink } from "@/components/related-pages";
import { ConfigPaths } from "@/components/config/ai/config-paths";
import { ConfigIntro } from "@/components/config/config-intro";
import { Cta } from "@/components/config/cta";
import { DocsShell } from "@/components/docs/docs-shell";
import { LegacyAnchorRedirect } from "@/components/docs/legacy-anchor-redirect";
import { LatestRelease } from "@/components/latest-release";
import { LINK } from "@/components/prose";
import { DOCS_GROUPS, docsPath } from "@/lib/docs-pages";
import {
  AUTOMATIONS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONNECT_AGENTS_PATH,
  DOCS_PATH,
  SKILLS_PATH,
  SSH_TERMINAL_MAC_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
  youtubeLessonJsonLd,
} from "@/lib/structured-data";

const TITLE = "lpm Docs — Install, Configure Projects, and Ask Your AI Agent";
const DESCRIPTION =
  "Install lpm, then ask Claude Code or Codex to configure it, or edit it yourself: every key for services, actions, terminals, zones, profiles, and the shared layers.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: DOCS_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: DOCS_PATH,
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
    path: DOCS_PATH,
    about: [
      "lpm docs",
      "install lpm",
      "configure lpm with Claude Code and Codex",
      ".lpm.yml",
      "service detection",
      "dev server profiles",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Docs", path: DOCS_PATH },
  ]),
  youtubeLessonJsonLd("dynamic-action-labels"),
];

const RELATED: RelatedLink[] = [
  {
    href: CONNECT_AGENTS_PATH,
    title: "Let agents run your dev environment",
    description:
      "The same Agent tools let Claude Code and Codex start services, read logs, and duplicate projects.",
  },
  {
    href: AUTOMATIONS_PATH,
    title: "Scheduled automations",
    description:
      "Run an agent or a command on a schedule — the jobs you may see in a config file.",
  },
  {
    href: CLAUDE_ACCOUNTS_PATH,
    title: "Multiple Claude Code accounts",
    description:
      "Pin a Claude login to each project — the claudeAccount key, set from the project form.",
  },
  {
    href: SSH_TERMINAL_MAC_PATH,
    title: "SSH projects",
    description:
      "Run a remote machine's services, actions, and terminals from the same sidebar.",
  },
  {
    href: WORKTREE_AGENTS_PATH,
    title: "Git worktrees for AI agents",
    description:
      "Give each agent its own copy of a project that inherits this config.",
  },
  {
    href: SKILLS_PATH,
    title: "Your own Claude Code and Codex skills",
    description:
      "Create and edit agent skills in lpm, with AI drafting the SKILL.md for you.",
  },
];

export default function DocsPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <LegacyAnchorRedirect />
      <DocsShell current="">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          lpm docs
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
          lpm is a free desktop app for macOS, Windows and Linux that starts
          your projects&apos; dev servers and runs AI coding agents beside them.
          These docs cover its project config.
        </p>
        <LatestRelease source="docs-latest" className="mt-6" />
        <p className="mt-6 mb-8 text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
          New here?{" "}
          <Link
            href={docsPath("install")}
            className={LINK}
          >
            Install lpm
          </Link>{" "}
          and add a project folder. Then ask your AI agent to set it up for
          you, or edit the config yourself: every key is in the reference.
        </p>

        <ConfigPaths />

        <ConfigIntro />

        <h2 className="mt-14 text-xl font-bold tracking-tight text-gray-900 dark:text-white">
          Every page
        </h2>
        <div className="mt-5 grid gap-x-8 gap-y-8 sm:grid-cols-2">
          {DOCS_GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-[12px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
                {group.title}
              </h3>
              <ul className="mt-3 space-y-3">
                {group.pages.map((page) => (
                  <li key={page.slug}>
                    <Link href={docsPath(page.slug)} className="group block">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {page.title}
                        <ArrowRight
                          className="h-3.5 w-3.5 text-gray-400 transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
                        {page.description}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DocsShell>
      <RelatedPages links={RELATED} />
      <Cta />
    </>
  );
}
