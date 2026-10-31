import { DOCS_PATH } from "./links";

type DocsPageEntry = {
  slug: string;
  title: string;
  description: string;
  // The website file that holds the page's copy, for "Edit this page".
  source: string;
};

const SECTIONS = "components/config/sections";

const GROUPS = [
  {
    title: "Get started",
    pages: [
      {
        slug: "install",
        title: "Install lpm",
        description:
          "Download and install lpm on macOS, Windows or Linux, open your first project, and get past the warnings a beta build can show.",
        source: "components/docs/install-guide.tsx",
      },
      {
        slug: "ask-your-agent",
        title: "Ask your agent",
        description:
          "Configure lpm by asking Claude Code, Codex, Gemini CLI or OpenCode in plain words. The lpm skills teach the agent the config, and lpm checks every change.",
        source: "components/config/ai/agent-section.tsx",
      },
      {
        slug: "editor",
        title: "Editing in the app",
        description:
          "Change a project's config in lpm as a form, as YAML with schema hints, or let AI draft it from your code.",
        source: `${SECTIONS}/editor-section.tsx`,
      },
    ],
  },
  {
    title: "Configure",
    pages: [
      {
        slug: "project",
        title: "Project",
        description:
          "The lpm project file: the folder your code lives in, its name and Claude account, and SSH projects, with a live preview of the app.",
        source: `${SECTIONS}/project-section.tsx`,
      },
      {
        slug: "detection",
        title: "Service detection",
        description:
          "How lpm finds the dev servers in a folder you add: where it looks, what it recognizes, and how it names services and ports.",
        source: `${SECTIONS}/detection-section.tsx`,
      },
      {
        slug: "services",
        title: "Services",
        description:
          "Long-running processes lpm starts and stops together: commands, working folders, ports, env vars and dependsOn.",
        source: `${SECTIONS}/services-section.tsx`,
      },
      {
        slug: "actions",
        title: "Actions",
        description:
          "One-click buttons for tests, migrations and deploys: confirmations, split buttons, dropdowns, background actions and dynamic labels.",
        source: `${SECTIONS}/actions-section.tsx`,
      },
      {
        slug: "terminals",
        title: "Terminals",
        description:
          "Terminal actions open a tab that stays open: Claude Code, Codex, a REPL or a log tail, one click away in the project toolbar.",
        source: `${SECTIONS}/terminals-section.tsx`,
      },
      {
        slug: "zones",
        title: "Zones",
        description:
          "Group a project's buttons into framed zones in the header or footer, with rows, positions and sliding layers.",
        source: `${SECTIONS}/zones-section.tsx`,
      },
      {
        slug: "profiles",
        title: "Profiles",
        description:
          "Named sets of services you pick from the Start menu, so you can boot just the frontend or the whole stack.",
        source: `${SECTIONS}/profiles-section.tsx`,
      },
    ],
  },
  {
    title: "Share",
    pages: [
      {
        slug: "layers",
        title: "Config layers",
        description:
          "How your project file, the repo's .lpm.yml and global config merge, so a team shares one setup while you keep your own tweaks.",
        source: `${SECTIONS}/layers-section.tsx`,
      },
      {
        slug: "global-config",
        title: "Global config",
        description:
          "Actions and terminals in ~/.lpm/global.yml show up in every project: what a fresh install writes and what the file can hold.",
        source: `${SECTIONS}/global-section.tsx`,
      },
      {
        slug: "templates",
        title: "Templates",
        description:
          "Reuse a set of actions and terminals across some of your projects with templates in ~/.lpm/templates and extends.",
        source: `${SECTIONS}/templates-section.tsx`,
      },
    ],
  },
  {
    title: "More",
    pages: [
      {
        slug: "recipes",
        title: "Recipes",
        description:
          "Complete lpm configs to copy: a minimal blog, tests and linting, Next.js with a Node API, dev env vars, and a monorepo.",
        source: `${SECTIONS}/recipes-section.tsx`,
      },
      {
        slug: "path-resolution",
        title: "Path resolution",
        description:
          "How lpm resolves root and cwd, ~ and relative folders, on local and SSH projects.",
        source: `${SECTIONS}/path-section.tsx`,
      },
      {
        slug: "validation",
        title: "Validation",
        description:
          "What lpm config validate checks, and what the app refuses to save or start.",
        source: `${SECTIONS}/validation-section.tsx`,
      },
    ],
  },
] as const satisfies readonly { title: string; pages: readonly DocsPageEntry[] }[];

export type DocsSlug = (typeof GROUPS)[number]["pages"][number]["slug"];
export type DocsPage = DocsPageEntry & { slug: DocsSlug };
export type DocsGroup = { title: string; pages: readonly DocsPage[] };

export const DOCS_GROUPS: readonly DocsGroup[] = GROUPS;
export const DOCS_PAGES: readonly DocsPage[] = DOCS_GROUPS.flatMap((group) => group.pages);

export const docsPath = (slug: DocsSlug): string => `${DOCS_PATH}/${slug}`;

export function findDocsPage(slug: string): DocsPage | undefined {
  return DOCS_PAGES.find((page) => page.slug === slug);
}

// The single-page /config the docs replaced named its sections by these
// slugs, so old deep links like /config#zones land on the page that took the
// section over. Two sections were named differently.
const LEGACY_ALIASES: Record<string, DocsSlug> = {
  "with-ai": "ask-your-agent",
  reference: "project",
};

export function docsPathForLegacyId(id: string): string | undefined {
  const page = findDocsPage(LEGACY_ALIASES[id] ?? id);
  return page && docsPath(page.slug);
}

export type DocsNeighbor = { href: string; title: string };

const OVERVIEW: DocsNeighbor = { href: DOCS_PATH, title: "Overview" };

export function docsNeighbors(slug: string): {
  previous: DocsNeighbor | null;
  next: DocsNeighbor | null;
} {
  const index = DOCS_PAGES.findIndex((page) => page.slug === slug);
  const toNeighbor = (page: DocsPage | undefined) =>
    page ? { href: docsPath(page.slug), title: page.title } : null;
  return {
    previous: index === 0 ? OVERVIEW : toNeighbor(DOCS_PAGES[index - 1]),
    next: toNeighbor(DOCS_PAGES[index + 1]),
  };
}
