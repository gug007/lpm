import type { Metadata } from "next";
import { SectionHeader } from "@/components/section-header";
import { RelatedPages, type RelatedLink } from "@/components/related-pages";
import { AgentSection } from "@/components/config/ai/agent-section";
import { ConfigPaths } from "@/components/config/ai/config-paths";
import { ConfigIntro } from "@/components/config/config-intro";
import { Cta } from "@/components/config/cta";
import { MobileTableOfContents } from "@/components/config/mobile-toc";
import { ActionsSection } from "@/components/config/sections/actions-section";
import { DetectionSection } from "@/components/config/sections/detection-section";
import { EditorSection } from "@/components/config/sections/editor-section";
import { GlobalSection } from "@/components/config/sections/global-section";
import { LayersSection } from "@/components/config/sections/layers-section";
import { PathSection } from "@/components/config/sections/path-section";
import { ProfilesSection } from "@/components/config/sections/profiles-section";
import { ProjectSection } from "@/components/config/sections/project-section";
import { RecipesSection } from "@/components/config/sections/recipes-section";
import { ServicesSection } from "@/components/config/sections/services-section";
import { TemplatesSection } from "@/components/config/sections/templates-section";
import { TerminalsSection } from "@/components/config/sections/terminals-section";
import { ValidationSection } from "@/components/config/sections/validation-section";
import { ZonesSection } from "@/components/config/sections/zones-section";
import { TableOfContents } from "@/components/config/toc";
import {
  AUTOMATIONS_PATH,
  CLAUDE_ACCOUNTS_PATH,
  CONFIG_PATH,
  CONNECT_AGENTS_PATH,
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

const TITLE = "lpm Config — Set Up Projects with AI Agents or YAML";
const DESCRIPTION =
  "Ask Claude Code or Codex to configure lpm for you, or edit it yourself: every key for services, actions, terminals, zones, profiles, and the shared layers.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: {
    canonical: CONFIG_PATH,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CONFIG_PATH,
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
    path: CONFIG_PATH,
    about: [
      "lpm config",
      "configure lpm with Claude Code and Codex",
      ".lpm.yml",
      "service detection",
      "dev server profiles",
      "Claude Code terminal actions",
    ],
  }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Config reference", path: CONFIG_PATH },
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

export default function ConfigPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <section className="pt-28 sm:pt-36 pb-20">
        <div className="max-w-5xl mx-auto px-6">
          <SectionHeader
            eyebrow="Docs"
            title="lpm config"
            description="Ask your AI agent to set up a project for you, or edit the config yourself — every key is below."
            as="h1"
            className="mb-10"
          />

          <ConfigPaths />

          <AgentSection />

          <ConfigIntro />

          <MobileTableOfContents />

          <div className="lg:flex lg:gap-12">
            <aside className="hidden lg:block lg:w-44 lg:flex-shrink-0">
              <div className="sticky top-20">
                <TableOfContents />
              </div>
            </aside>

            <div className="lg:flex-1 lg:min-w-0 lg:max-w-3xl">
              <EditorSection />
              <ProjectSection />
              <DetectionSection />
              <ServicesSection />
              <ActionsSection />
              <TerminalsSection />
              <ZonesSection />
              <ProfilesSection />
              <LayersSection />
              <GlobalSection />
              <TemplatesSection />
              <RecipesSection />
              <PathSection />
              <ValidationSection />
            </div>
          </div>
        </div>
      </section>
      <RelatedPages links={RELATED} />
      <Cta />
    </>
  );
}
