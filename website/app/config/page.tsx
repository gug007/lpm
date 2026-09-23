import type { Metadata } from "next";
import { SectionHeader } from "@/components/section-header";
import { RelatedPages, type RelatedLink } from "@/components/related-pages";
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
import { TerminalsSection } from "@/components/config/sections/terminals-section";
import { ValidationSection } from "@/components/config/sections/validation-section";
import { TableOfContents } from "@/components/config/toc";
import {
  CLAUDE_ACCOUNTS_PATH,
  CONFIG_PATH,
  SKILLS_PATH,
  SSH_TERMINAL_MAC_PATH,
  WORKTREE_AGENTS_PATH,
} from "@/lib/links";
import { breadcrumbJsonLd, jsonLdString, webPageJsonLd } from "@/lib/structured-data";

const TITLE = "lpm Config Reference — Services, Actions & Profiles";
const DESCRIPTION =
  "Every key in an lpm project config: services, actions, terminals, profiles, the shared .lpm.yml and global layers, and how lpm detects your services.";

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
];

const RELATED: RelatedLink[] = [
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
    href: SKILLS_PATH,
    title: "Skills for Claude Code and Codex",
    description:
      "Let your coding agents write, validate, and apply lpm configs for you.",
  },
  {
    href: WORKTREE_AGENTS_PATH,
    title: "Git worktrees for AI agents",
    description:
      "Give each agent its own copy of a project that inherits this config.",
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
            title="lpm config reference"
            description="Every key in a project config file, how lpm writes the first one for you, and how the project, repo, and global layers fit together."
            as="h1"
          />

          <ConfigIntro />

          <MobileTableOfContents />

          <div className="lg:flex lg:gap-12">
            <aside className="hidden lg:block lg:w-44 lg:flex-shrink-0">
              <div className="sticky top-20">
                <TableOfContents />
              </div>
            </aside>

            <div className="lg:flex-1 lg:min-w-0 lg:max-w-3xl">
              <ProjectSection />
              <DetectionSection />
              <ServicesSection />
              <ActionsSection />
              <TerminalsSection />
              <ProfilesSection />
              <LayersSection />
              <GlobalSection />
              <EditorSection />
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
