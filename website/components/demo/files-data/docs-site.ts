import type { ProjectFiles } from "./types";

// The counts here are load-bearing. `src/content/**/*.mdx` reports 42 matches:
// 41 routed pages under content/docs plus one snippet that is included rather
// than routed — which is also how the build reaches "42 pages" once
// src/pages/index.astro is added to the 41.
const DOCS = [
  "quickstart.mdx",
  "installation.mdx",
  "configuration.mdx",
  "api/api-keys.mdx",
  "api/errors.mdx",
  "api/events.mdx",
  "api/pagination.mdx",
  "api/plans.mdx",
  "api/rate-limits.mdx",
  "api/subscriptions.mdx",
  "api/teams.mdx",
  "api/users.mdx",
  "api/versioning.mdx",
  "guides/authentication-flow.mdx",
  "guides/billing.mdx",
  "guides/faq.mdx",
  "guides/first-project.mdx",
  "guides/migrations.mdx",
  "guides/sdks.mdx",
  "guides/self-hosting.mdx",
  "guides/sso.mdx",
  "guides/teams.mdx",
  "guides/testing.mdx",
  "guides/troubleshooting.mdx",
  "guides/upgrading.mdx",
  "guides/usage-limits.mdx",
  "guides/webhooks-in-production.mdx",
  "cli/config.mdx",
  "cli/deploy.mdx",
  "cli/env.mdx",
  "cli/install.mdx",
  "cli/login.mdx",
  "cli/logs.mdx",
  "changelog/2026-05.mdx",
  "changelog/2026-06.mdx",
  "changelog/2026-07.mdx",
  "changelog/2026-08.mdx",
  "changelog/2026-09.mdx",
].map((name) => `src/content/docs/${name}`);

export const DOCS_SITE: ProjectFiles = {
  paths: [
    ".gitignore",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "public/favicon.svg",
    "public/og.png",
    "src/components/Callout.astro",
    "src/components/CodeTabs.astro",
    "src/components/SidebarNav.astro",
    "src/content/snippets/auth-header.mdx",
    "src/layouts/DocsLayout.astro",
    "src/pages/api/feedback.ts",
    "src/pages/api/llms-txt.ts",
    "src/pages/api/og.ts",
    "src/pages/api/search.ts",
    "src/pages/docs/[...slug].astro",
    "src/pages/index.astro",
    "src/styles/global.css",
    ...DOCS,
  ],
  content: {
    ".lpm.yml": `name: docs-site
root: ~/Projects/docs-site

services:
  site:
    cmd: pnpm dev
    port: 4321

actions:
  build: pnpm build
  deploy:
    cmd: vercel deploy --prod
    confirm: true
`,
    "README.md": `# docs-site

The public documentation, built with Astro and MDX and deployed to Vercel.

## Running it

\`\`\`bash
pnpm install
pnpm dev          # :4321
\`\`\`

## Writing a page

Everything under \`src/content/docs\` is a page. The path becomes the URL, so
\`api/webhooks.mdx\` is served at \`/docs/api/webhooks\`. Frontmatter needs a
\`title\`; everything else is optional.

Components in \`src/components\` are available to any page — \`<Callout>\` for
asides, \`<CodeTabs>\` for multi-language samples, \`<ApiEndpoint>\` for the
method-and-path header on API reference pages.

## Deploying

\`pnpm build\` writes \`dist/\`, and \`vercel deploy --prod\` ships it.
Redirects and headers live in \`vercel.json\`.
`,
    "package.json": `{
  "name": "docs-site",
  "type": "module",
  "version": "1.9.2",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  },
  "dependencies": {
    "@astrojs/mdx": "^3.1.3",
    "@astrojs/sitemap": "^3.1.6",
    "astro": "^4.8.3",
    "sharp": "^0.33.4"
  },
  "devDependencies": {
    "@astrojs/check": "^0.7.0",
    "typescript": "^5.5.4"
  }
}
`,
    "astro.config.mjs": `import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  site: "https://docs.example.com",
  integrations: [
    mdx(),
    sitemap(),
  ],
});
`,
    "vercel.json": `{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "astro",
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "cleanUrls": true,
  "trailingSlash": false,
  "redirects": [
    { "source": "/docs/api-keys", "destination": "/docs/api/api-keys", "permanent": true },
    { "source": "/docs/auth", "destination": "/docs/api/authentication", "permanent": true },
    { "source": "/guides/:slug", "destination": "/docs/guides/:slug", "permanent": true }
  ],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" }
      ]
    },
    {
      "source": "/_astro/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
`,
    "src/content/config.ts": `import { defineCollection, z } from "astro:content";

const docs = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

// Included by other pages rather than routed, so it never reaches the sitemap.
const snippets = defineCollection({
  type: "content",
  schema: z.object({ title: z.string().optional() }),
});

export const collections = { docs, snippets };
`,
    "src/content/docs/api/authentication.mdx": `---
title: Authentication
---

Send your key in the \`Authorization\` header:

\`\`\`bash
curl -H "Authorization: Bearer $API_KEY" https://api.example.com/v2/me
\`\`\`

Keys are scoped. A key created for \`read\` cannot write, and a key scoped to a
single project cannot see any other. Rotate a key from the dashboard; the old
one keeps working for an hour so you can deploy without a gap.

Requests without a key get \`401\`. Requests with a key that has the wrong scope
get \`403\` and an \`error.scope\` field naming the scope that was needed.
`,
    "src/content/docs/api/webhooks.mdx": `---
title: Webhooks
---

Every webhook is signed with \`X-Signature\`. Verify it before
trusting the payload.

<ApiEndpoint method="POST" path="/v2/webhooks" />
`,
    "src/components/ApiEndpoint.astro": `---
const { method, path } = Astro.props;
---

<div class="endpoint">
  <span class={\`method method--\${method.toLowerCase()}\`}>{method}</span>
  <code>{path}</code>
</div>
`,
    "src/content/docs/index.mdx": `---
title: Documentation
---

Everything you need to get an integration running, from the first request to
production webhooks.

## Guides

Longer, task-shaped walkthroughs. Start with a first project and come back for
billing and SSO when you need them.

## API

Start here if you're new.

- [Quickstart](/docs/quickstart)
- [Authentication](/docs/api/authentication)
- [Webhooks](/docs/api/webhooks)
- [Errors](/docs/api/errors)

## CLI

Install it with \`npm i -g example\`, then \`example login\`.
`,
  },
};
