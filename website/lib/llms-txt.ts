import { APP_DESCRIPTION, FEATURE_LIST, OPERATING_SYSTEMS } from "./app-facts";
import { DOCS_PAGES, docsPath } from "./docs-pages";
import { COMPARE_LABELS, FOOTER_GROUPS } from "./footer-links";
import {
  CHANGELOG_PATH,
  DOCS_PATH,
  FEATURES_PATH,
  MOBILE_PATH,
  RELEASES_URL,
  REPO_URL,
  SECURITY_PATH,
  SITE_URL,
  STATS_PATH,
  VS_BASE_PATH,
  VS_SLUGS,
  vsPath,
} from "./links";

const url = (path: string) => `${SITE_URL}${path}`;

const item = (title: string, href: string, note?: string) =>
  `- [${title}](${href})${note ? `: ${note}` : ""}`;

// The site as an index for coding agents (https://llmstxt.org): what lpm is,
// then every docs page, guide and comparison, built from the same lists the
// docs sidebar and the footer render.
export function buildLlmsTxt(): string {
  const guides = FOOTER_GROUPS.filter((group) => group.guides).flatMap(
    (group) => group.links,
  );
  return [
    "# lpm",
    "",
    `> ${APP_DESCRIPTION}`,
    "",
    'lpm ("local project manager") keeps each project\'s services, actions and terminals in a YAML config. Agents can operate it through the `lpm` CLI and configure it with the lpm skills; see "Ask your agent" below.',
    "",
    `- Runs on: ${OPERATING_SYSTEMS}`,
    `- License: MIT, free with no paid tier. Source: ${REPO_URL}`,
    `- Download: ${url("/#download")} or ${RELEASES_URL}`,
    "",
    "What it does:",
    "",
    ...FEATURE_LIST.map((feature) => `- ${feature}`),
    "",
    "## Docs",
    "",
    item(
      "Docs overview",
      url(DOCS_PATH),
      "install lpm, then configure it yourself or ask your agent to",
    ),
    ...DOCS_PAGES.map((page) =>
      item(page.title, url(docsPath(page.slug)), page.description),
    ),
    "",
    "## Guides",
    "",
    ...guides.map((link) => item(link.label, url(link.href))),
    "",
    "## Comparisons",
    "",
    item("lpm compared with other tools", url(VS_BASE_PATH)),
    ...VS_SLUGS.map((slug) =>
      item(`lpm vs ${COMPARE_LABELS[slug]}`, url(vsPath(slug))),
    ),
    "",
    "## Optional",
    "",
    item("All features", url(FEATURES_PATH), "everything lpm does, on one page"),
    item("iPhone companion", url(MOBILE_PATH), "lpm Link, for driving lpm from a phone"),
    item("Changelog", url(CHANGELOG_PATH), "notes for every release, newest first"),
    item("Download stats", url(STATS_PATH)),
    item("Security", url(SECURITY_PATH), "signing, notarization and checksums"),
    "",
  ].join("\n");
}
