# SSH SEO Page — Template Spec

This spec reverse-engineers the existing SEO page template used by the three sibling pages
(`/best-terminal-for-mac`, `/mac-terminal-for-developers`, `/git-terminal-for-mac`). The new
`/ssh-terminal-for-mac` page must structurally match them. Component builders should copy
prop names, import paths, and class strings directly from this document.

---

## 1. Section order and component file names

The two newer siblings (`mac-terminal-for-developers`, `git-terminal-for-mac`) use the
**eight-section** order shown below. The oldest sibling (`best-terminal-for-mac`) uses the
same order but renames the second section to `WhyMac`. **The SSH page must follow the
newer convention** — second section is named `Problem`, the file is `_components/problem.tsx`,
the import name is `Problem`.

Render order in `page.tsx`:

```
Hero  →  Problem  →  Features  →  Benefits  →  Workflows  →  Comparison  →  Faq  →  Cta
```

Component files (all lowercase, matching the sibling siblings exactly):

| Order | Component | File path                                                |
|------:|-----------|----------------------------------------------------------|
| 1     | `Hero`        | `website/app/ssh-terminal-for-mac/_components/hero.tsx`        |
| 2     | `Problem`     | `website/app/ssh-terminal-for-mac/_components/problem.tsx`     |
| 3     | `Features`    | `website/app/ssh-terminal-for-mac/_components/features.tsx`    |
| 4     | `Benefits`    | `website/app/ssh-terminal-for-mac/_components/benefits.tsx`    |
| 5     | `Workflows`   | `website/app/ssh-terminal-for-mac/_components/workflows.tsx`   |
| 6     | `Comparison`  | `website/app/ssh-terminal-for-mac/_components/comparison.tsx`  |
| 7     | `Faq`         | `website/app/ssh-terminal-for-mac/_components/faq.tsx`         |
| 8     | `Cta`         | `website/app/ssh-terminal-for-mac/_components/cta.tsx`         |

All exports are **default exports** (no `export const`, no named exports). The `page.tsx`
template imports each by default name and renders them in a fragment, e.g.:

```tsx
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";

export default function SshTerminalForMacPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <Cta />
    </>
  );
}
```

There is no page-level wrapper `<main>` / `<div>` — the layout (`app/layout.tsx`) already
wraps `<main className="flex-1">…</main>` around the page output and supplies the global
`<Nav />` and `<Footer />`. Each section component owns its own `<section>` element and
its own padding.

---

## 2. Per-section prop / data shape

Each section is **self-contained**: data is hard-coded inside the component as a top-level
`const` array of plain objects, then mapped to JSX. Sections take **no props** from
`page.tsx`. The shapes below describe the in-file `const` arrays.

### 2.1 Hero (`hero.tsx`)

No data array. The hero is a single block of JSX. Required pieces:

- An eyebrow `<p>` (uppercase tracking-widest small caps).
- An `<h1>` with the gradient bg-clip class string (see §10.3).
- A `<p>` subtitle (max-w-xl gray).
- A centered `<HeroDownload />` (see §8).
- A trailing "View on GitHub →" link (uses `REPO_URL` from `@/lib/links`, `ArrowRight` icon).

Imports the sibling pages all use:

```tsx
import { ArrowRight } from "lucide-react";
import { REPO_URL } from "@/lib/links";
import { HeroDownload } from "@/components/home/hero-download";
```

Wrapper: `<section className="pt-28 sm:pt-40 pb-12 sm:pb-20 text-center">` with inner
`<div className="max-w-4xl mx-auto px-6">`.

### 2.2 Problem (`problem.tsx`)

Three problem cards in a 1/2/3-column responsive grid using `FeatureCard size="lg"`.

```ts
const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ..., title: "...", body: "..." },
  { icon: ..., title: "...", body: "..." },
  { icon: ..., title: "...", body: "..." },
];
```

Imports:

```tsx
import { /* three icons */, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
```

Wrapper:

```tsx
<section className="py-20 sm:py-24">
  <div className="max-w-5xl mx-auto px-6">
    <SectionHeader
      eyebrow="..."
      title="..."
      description="..."
      className="mb-12"   // override from default mb-14
    />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {CARDS.map(({ icon, title, body }) => (
        <FeatureCard key={title} icon={icon} title={title} size="lg">
          {body}
        </FeatureCard>
      ))}
    </div>
  </div>
</section>
```

Notes:
- `body` is a plain `string`. (In `Features` it can be `React.ReactNode`; in `Problem` all
  three siblings keep it `string`.)
- The header gets `className="mb-12"` (override) — `SectionHeader` defaults to `mb-14`.

### 2.3 Features (`features.tsx`)

Six feature cards in a 1/2-column responsive grid using `FeatureCard size="sm"` (the
default — no `size` prop passed).

```ts
type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;        // can include <code>, <br>, JSX
};

const FEATURES: Feature[] = [ /* exactly 6 items */ ];
```

Imports:

```tsx
import {
  /* six icons */,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
```

Wrapper:

```tsx
<section className="py-20 sm:py-24">
  <div className="max-w-3xl mx-auto px-6">
    <SectionHeader eyebrow="..." title="..." description="..." />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {FEATURES.map(({ icon, title, body }) => (
        <FeatureCard key={title} icon={icon} title={title}>
          {body}
        </FeatureCard>
      ))}
    </div>
  </div>
</section>
```

Notes:
- Inline code spans use `<code className="text-xs">…</code>`.
- Smart quotes/apostrophes inside JSX text use HTML entities (`&rsquo;`, `&ldquo;`,
  `&rdquo;`) — see git-terminal `workflows.tsx` for examples.
- Container width is `max-w-3xl` (narrower than Problem's `max-w-5xl`).

### 2.4 Benefits (`benefits.tsx`)

Four numbered outcomes rendered as an `<ol>` with two-column grid (number, body).

```ts
type Outcome = { title: string; body: string };
const OUTCOMES: Outcome[] = [ /* exactly 4 items */ ];
```

Imports: only `SectionHeader` — no icons, no `FeatureCard`.

```tsx
import { SectionHeader } from "@/components/section-header";
```

Wrapper:

```tsx
<section className="py-20 sm:py-24">
  <div className="max-w-3xl mx-auto px-6">
    <SectionHeader eyebrow="..." title="..." description="..." />
    <ol className="space-y-10">
      {OUTCOMES.map(({ title, body }, i) => (
        <li key={title}
            className="grid grid-cols-[auto_1fr] gap-x-6 sm:gap-x-8 items-start">
          <span aria-hidden="true"
                className="text-4xl sm:text-5xl font-bold tabular-nums text-gray-200 dark:text-gray-800 leading-none select-none">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="border-l border-gray-200 dark:border-gray-800 pl-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {title}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  </div>
</section>
```

Note: numbers are zero-padded (`01`, `02`, `03`, `04`).

### 2.5 Workflows (`workflows.tsx`)

Three numbered scenarios (large numbered circle, title, body that may contain JSX).

```ts
type Workflow = { title: string; body: React.ReactNode };
const WORKFLOWS: Workflow[] = [ /* exactly 3 items */ ];
```

Imports: `SectionHeader` only.

Wrapper:

```tsx
<section className="py-20 sm:py-24">
  <div className="max-w-3xl mx-auto px-6">
    <SectionHeader eyebrow="..." title="..." description="..." />
    <div className="space-y-12">
      {WORKFLOWS.map((workflow, i) => (
        <div key={workflow.title} className="relative pl-10">
          <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-xs font-bold text-white dark:text-gray-900">
            {i + 1}
          </div>
          <h3 className="text-lg font-semibold mb-1.5">{workflow.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            {workflow.body}
          </p>
        </div>
      ))}
    </div>
  </div>
</section>
```

### 2.6 Comparison (`comparison.tsx`)

Capability matrix: lpm + 5 alternatives = 6 columns. Capability rows are typically 8.

```ts
type AlternativeKey = "lpm" | /* 5 other keys, lowercase camelCase */;

type Capability = { label: string } & Record<AlternativeKey, boolean>;

const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  /* 5 more — display name in `label` */
];

const CAPABILITIES: Capability[] = [ /* one row per capability */ ];
```

The component renders **two layouts**, controlled by responsive Tailwind classes:

- `.hidden sm:block …<table>…` — desktop table; lpm column gets the highlight class
  `bg-gray-100/70 dark:bg-white/[0.04]` and white/black header text.
- `.sm:hidden …` — mobile view as a stack of per-alternative cards; the lpm card gets
  `border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-white/[0.04]`.

A local `Indicator` helper renders `<Check />` (lucide) for true and `<X />` (lucide) for
false, both `w-4 h-4`. Copy this helper verbatim from any sibling.

Imports:

```tsx
import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
```

Wrapper: `<section className="py-20 sm:py-24"><div className="max-w-4xl mx-auto px-6">…`.

Header pattern:

```tsx
<SectionHeader
  eyebrow="How it compares"
  title="lpm vs <comma-separated alternative names>"
  description="..."
/>
```

The simplest path is to **clone `git-terminal-for-mac/_components/comparison.tsx`**
end-to-end and edit only:
1. `AlternativeKey` union members.
2. `ALTERNATIVES` array (keep `{ key: "lpm", label: "lpm" }` first).
3. `CAPABILITIES` array.
4. The `<SectionHeader title>` and `description` strings.

Lpm is **always the first column**, always highlighted.

### 2.7 Faq (`faq.tsx`)

A list of `<details>`/`<summary>` collapsible Q&A items, plus an inline `<script
type="application/ld+json">` that emits `FAQPage` schema.org structured data.

Two shape variants exist across siblings:

A. **String answers** (used by `mac-terminal-for-developers` and `git-terminal-for-mac` —
   recommended for the SSH page):

```ts
type QA = { question: string; answer: string };
const FAQS: QA[] = [ /* 6 items */ ];
```

B. **Mixed JSX answers + plain-text override** (used by `best-terminal-for-mac`):

```ts
type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string; // plain-text fallback for JSON-LD
};
```

Pick variant **A** (plain strings) unless an answer must contain inline `<code>` or links.
The simpler shape avoids the `answerText` override.

Imports (variant A):

```tsx
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
```

JSON-LD construction (variant A):

```ts
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};
```

The `<script>` is rendered **inside** the section, via
`dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}`.

Wrapper:

```tsx
<section className="py-20 sm:py-24">
  <div className="max-w-3xl mx-auto px-6">
    <SectionHeader eyebrow="FAQ" title="..." />   {/* no description */}
    <ul className="space-y-3">
      {FAQS.map(({ question, answer }) => (
        <li key={question}>
          <details className="group rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200 open:border-gray-300 dark:open:border-gray-700 open:bg-gray-50/50 dark:open:bg-white/[0.02]">
            <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
              <span>{question}</span>
              <ChevronDown className="w-4 h-4 shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              {answer}
            </div>
          </details>
        </li>
      ))}
    </ul>
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
    />
  </div>
</section>
```

Use 6 Q&A items (every sibling uses 6). The eyebrow is always the literal string
`"FAQ"`. The `<SectionHeader>` here intentionally has **no `description`** prop — the
questions carry the section.

### 2.8 Cta (`cta.tsx`)

Final download CTA — large gradient `<h2>` headline, gray paragraph, centered
`<HeroDownload />`, trailing "View on GitHub →" link.

No data array. Imports identical to Hero:

```tsx
import { ArrowRight } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { REPO_URL } from "@/lib/links";
```

Wrapper:

```tsx
<section className="py-20 sm:py-24 text-center">
  <div className="max-w-3xl mx-auto px-6">
    <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500 dark:from-white dark:via-gray-200 dark:to-gray-500 bg-clip-text text-transparent">
      First line of headline.
      <br className="hidden sm:block" />
      Second line of headline.
    </h2>
    <p className="mt-6 text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-xl mx-auto leading-relaxed tracking-wide">
      ...subtitle paragraph...
    </p>

    <div className="mt-10 flex justify-center">
      <HeroDownload />
    </div>

    <div className="mt-8">
      <a href={REPO_URL}
         className="text-[13px] text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 inline-flex items-center gap-1.5">
        View on GitHub
        <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  </div>
</section>
```

---

## 3. Shared primitives — exact import paths

All sibling pages import shared primitives via the `@/` path alias (this resolves to
`website/`).

| Primitive            | Import path                           | Notes                                                         |
|----------------------|---------------------------------------|---------------------------------------------------------------|
| `SectionHeader`      | `@/components/section-header`         | Named export. Props: `{ eyebrow?, title, description?, as?, className? }`. `as` defaults to `"h2"`; pass `"h1"` only if used in a hero (siblings use raw `<h1>`, not `SectionHeader`). `className` defaults to `mb-14`; Problem overrides to `mb-12`. |
| `FeatureCard`        | `@/components/feature-card`           | Named export. Props: `{ icon: LucideIcon, title: string, children: ReactNode, size?: "sm" \| "lg" }`. `size` defaults to `"sm"`. Problem uses `"lg"`; Features uses default. |
| `HeroDownload`       | `@/components/home/hero-download`     | Named export. **Client component (`"use client"`)**. No props. Renders the platform-aware "Download for macOS …" button + signature badge. |
| Lucide icons         | `lucide-react`                        | Named imports (e.g. `import { GitBranch, ArrowRight, Check, X, ChevronDown, type LucideIcon } from "lucide-react"`). |
| Path constants       | `@/lib/links`                         | `REPO_URL`, the new `SSH_TERMINAL_MAC_PATH` (to be added — see §6). |

`SectionHeader` source signature (`website/components/section-header.tsx`):

```tsx
type Props = {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  as?: "h1" | "h2";
  className?: string;
};
```

`FeatureCard` source signature (`website/components/feature-card.tsx`):

```tsx
type FeatureCardProps = {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  size?: "sm" | "lg";
};
```

Do **not** create new shared primitives. Everything composes from the two above plus
plain Tailwind.

### 3.1 Lucide icon set conventions

Sibling pages pull icons from `lucide-react` only. Common ones already used by siblings
include `GitBranch`, `GitPullRequestArrow`, `FolderKanban`, `LayoutGrid`, `Layers`,
`Eye`, `Zap`, `Cpu`, `Bot`, `Moon`, `Battery`, `MonitorCog`, `MonitorX`,
`PanelsTopLeft`, `LayoutPanelLeft`, `RefreshCcw`, `ScrollText`, `Check`, `X`,
`ChevronDown`, `ArrowRight`, `ArrowDown`. Pick SSH-relevant icons from the same library
(e.g. `Terminal`, `Server`, `Network`, `Plug`, `KeyRound`, `Shuffle`, `RadioTower`,
`Activity`, `ListTree`).

---

## 4. Metadata contract

Every sibling page exports a `Metadata` constant in its `page.tsx`. The shape is fixed.
The SSH page must export the same shape.

### 4.1 Lengths observed across siblings

| Field                  | Best  | Developers | Git   |
|------------------------|------:|-----------:|------:|
| `title` chars          | 54    | 52         | 58    |
| `description` chars    | 154   | 156        | 163   |
| `keywords` count       | 20    | 19         | 20    |

**Targets for SSH page**: `title` ≈ 50–60 chars; `description` ≈ 150–165 chars; `keywords`
≈ 18–20 entries (last two should always be `"lpm"` and `"local project manager"`).

### 4.2 Exact TS structure

Every sibling exports an object with **these eight top-level keys** in this order. Keep
the order to keep diffs clean.

```ts
import type { Metadata } from "next";
import { SSH_TERMINAL_MAC_PATH } from "@/lib/links";

export const metadata: Metadata = {
  title: "<TITLE — 50–60 chars>",
  description: "<DESCRIPTION — 150–165 chars>",
  keywords: [
    "<primary keyword>",
    "<…18 more SSH-related variants…>",
    "lpm",
    "local project manager",
  ],
  alternates: {
    canonical: SSH_TERMINAL_MAC_PATH,
  },
  openGraph: {
    title: "<TITLE — same as above>",
    description: "<OG-specific description, often shorter and punchier>",
    type: "website",
    url: SSH_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "<TITLE — same as above>",
    description: "<TWITTER-specific description, may differ from OG>",
  },
};
```

Notes:
- `alternates.canonical` is the **path string** (starts with `/`, no host). The site's
  `metadataBase` (`https://lpm.cx`, set in `app/layout.tsx`) joins it for the absolute URL.
- `openGraph.url` is also a path. Same reason.
- No `metadataBase` field at the page level — the layout owns it.
- No `robots` field — the global `app/robots.ts` allows everything.
- No `themeColor`, `viewport`, or `icons` overrides — the layout owns those.

### 4.3 OG image

There is no per-page `openGraph.images` array. The site relies on the global
`app/opengraph-image.tsx` route convention to generate the OG image. **Do not** add an
`images` field to the SSH page metadata.

---

## 5. `_copy.md` structure

Each sibling has a `_copy.md` next to its `page.tsx`. It is the editorial source of
truth — the engineer translates it into `_components/*.tsx`. The new SSH page must ship
with one too.

### 5.1 Top-level outline (verbatim layout used by `git-terminal-for-mac/_copy.md`)

```
# /<route> — Content & Copy Plan

Page route: `/<route>`
Target primary keyword: **<keyword>**
Intent: <one-line audience + intent statement>

**Angle:** <how this page differs from the other SEO pages>

---

## 1. Metadata
```ts
title: "..."
// <length> chars
description: "..."
// <length> chars
keywords: [ ... ]
alternates.canonical: "/<route>"
openGraph.title: "..."
openGraph.description: "..."
openGraph.type: "website"
openGraph.url: "/<route>"
openGraph.siteName: "lpm"
twitter.card: "summary_large_image"
twitter.title: "..."
twitter.description: "..."
```

---

## 2. Section outlines
Eight sections, rendered in this order: `Hero → Problem → Features → Benefits → Workflows → Comparison → Faq → Cta`

Note for infra-engineer: <component-naming reminder>

### Hero
- eyebrow, H1, subtitle, primary CTA, secondary link, angle

### Problem
- eyebrow, H2 title, subtitle
- Three problem cards (icon + title + body)

### Features
- eyebrow, H2 title, subtitle
- Six feature cards (icon + title + body) — list each

### Benefits
- eyebrow, H2 title, subtitle
- Four numbered outcomes — title + body for each

### Workflows
- eyebrow, H2 title, subtitle
- Three numbered workflows — title + body for each

### Comparison
- eyebrow, H2 title, subtitle (matrix is summarized; full table lives in §4)

### FAQ
- eyebrow ("FAQ"), H2 title, subtitle (none)
- 6 Q&A summarized; full text in §5

### CTA
- (no eyebrow, hero-style heading)
- H2 split into two lines
- subtitle, primary CTA, secondary link

---

## 3. Hero-specific
- Eyebrow / H1 / Subtitle / Primary CTA label / Secondary link label

---

## 4. Comparison matrix
- Columns left-to-right with lpm first
- Markdown table of capability rows × alternative columns
- Engineer notes (highlight lpm column, mobile cards, etc.)

---

## 5. FAQ (6 Q&A, plain text for JSON-LD)
- Numbered list of Q/A pairs

---

## Notes for engineers copying this file
- Component filenames and section names
- Comparison matrix deviations (vs sibling pages)
- Path constant name suggestion (e.g. `SSH_TERMINAL_MAC_PATH`)
- Canonical URL
- Other notes (icons, JSON-LD answer-text override, sitemap addition)
```

### 5.2 Voice

All siblings use the same voice:
- **Direct, second-person, present tense.** "You context-switch", not "users
  context-switch".
- **Concrete and specific.** Real tool names (GitKraken, iTerm2, Hyper, tmux,
  GitHub Actions, Rails, Next.js, Docker Compose). Real commands in `<code>` tags
  (`git rebase -i`, `npm run dev`).
- **Pain → mechanism → outcome.** Each card opens with a friction the reader
  recognizes, then names the lpm capability that resolves it, then states the resulting
  outcome.
- **No emoji.** No exclamation marks. No "transform your workflow" boilerplate.
- **Short paragraphs.** Card body 2–4 sentences max.
- Em-dashes (`—`) used liberally as a pause, never hyphens.

For the SSH page specifically: **never** include real personal hostnames, IPs, paths, or
emails. Use placeholders (`user@build-server`, `~/Code/<repo>`, `127.0.0.1:5432`, etc.).
Treat tmux as an internal detail — describe behavior in product terms, not implementation.

---

## 6. How `nav.tsx` and `footer.tsx` surface SEO pages

### 6.1 `nav.tsx`

**The top nav does NOT link to any of the three existing SEO pages.** It only links to:
- `/` (home, via the lpm logo)
- `/config` (Docs link)
- `AI_AGENTS_PATH` (`/best-terminal-for-claude-code-and-codex` — "For AI agents")
- `VS_BASE_PATH` (`/vs` — "Compare")

The mobile nav (`nav-mobile-menu.tsx`) mirrors the desktop nav and only surfaces
`AI_AGENTS_PATH` and `VS_BASE_PATH`.

**Decision for the SSH page integrator: do NOT add a top-nav link.** That keeps the
treatment consistent with all three current SEO pages. They are discovered via search,
the footer guide list, and internal linking from `_copy.md` — not the global nav.

### 6.2 `footer.tsx`

The footer has a **"Guides" `<nav>`** that lists every SEO page in this set. Currently it
contains three links, separated by middle-dot separators:

```tsx
<Link href={BEST_TERMINAL_MAC_PATH}>Best terminal for Mac</Link>
·
<Link href={MAC_TERMINAL_DEVELOPERS_PATH}>Mac terminal for developers</Link>
·
<Link href={GIT_TERMINAL_MAC_PATH}>Git terminal for Mac</Link>
```

**Decision for the SSH page integrator: ADD a fourth Guides entry.** Insert
`<Link href={SSH_TERMINAL_MAC_PATH}>SSH terminal for Mac</Link>` after the Git entry,
matching the existing dot-separator pattern. See `website/components/footer.tsx:46-74`.

### 6.3 `lib/links.ts`

Add a new exported constant alongside the existing siblings:

```ts
export const BEST_TERMINAL_MAC_PATH = "/best-terminal-for-mac";
export const MAC_TERMINAL_DEVELOPERS_PATH = "/mac-terminal-for-developers";
export const GIT_TERMINAL_MAC_PATH = "/git-terminal-for-mac";
export const SSH_TERMINAL_MAC_PATH = "/ssh-terminal-for-mac";   // NEW
```

Import it from `page.tsx` for `alternates.canonical` and `openGraph.url`, and from
`footer.tsx` for the new Guides link.

### 6.4 `app/sitemap.ts`

Add a new sitemap entry. Mirror the shape of the existing SEO entries
(`changeFrequency: "monthly"`, `priority: 0.8`):

```ts
{
  url: `${SITE_URL}${SSH_TERMINAL_MAC_PATH}`,
  lastModified,
  changeFrequency: "monthly",
  priority: 0.8,
},
```

Insertion point: after the existing `GIT_TERMINAL_MAC_PATH` entry, before the
`VS_BASE_PATH` block. See `website/app/sitemap.ts:51-56` for the pattern.

`robots.ts` requires no changes — it allows `/` globally and references the sitemap.

---

## 7. Structured data (JSON-LD) emission

Two structured-data scripts are emitted per page:

### 7.1 SoftwareApplication (global, in layout)

`app/layout.tsx` already emits a `SoftwareApplication` JSON-LD block in `<head>` for
every route. Do **not** duplicate this on the SSH page.

### 7.2 FAQPage (per page, inside Faq section)

The FAQ section is the only place a page emits its own structured data. Each sibling
serializes a `FAQPage` schema.org object inline:

```tsx
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  })),
};

<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
/>
```

Important constraints:
- The script is rendered **inside** the same `<section>` as the questions. It is **not**
  hoisted into `<head>`.
- If any answer is JSX (variant B in §2.7), provide a plain-text `answerText` and use
  `text: typeof answer === "string" ? answer : answerText ?? ""`. The recommended path
  for the SSH page is variant A (string answers), which avoids this entirely.
- **Recommendation**: keep all 6 SSH FAQ answers as plain strings.

No other JSON-LD types (HowTo, BreadcrumbList, Product) are emitted by sibling pages.
Do not add new structured data types unless the architect asks.

---

## 8. Download CTA pattern

Every sibling renders the primary download button via the same component:

```tsx
import { HeroDownload } from "@/components/home/hero-download";
…
<div className="mt-10 flex justify-center">
  <HeroDownload />
</div>
```

`HeroDownload` (`website/components/home/hero-download.tsx`) is a **client component**
(`"use client"` at top). It:
- Calls `usePlatform()` (`@/lib/use-platform`) to detect Apple Silicon vs Intel.
- Picks the correct `releaseAsset(...)` URL — `lpm-desktop-macos-arm64.dmg` or
  `lpm-desktop-macos-amd64.dmg`. Both helpers come from `@/lib/links`.
- Falls back to label `"Download for macOS"` and `href="#download"` while the platform
  hook is still resolving (server render / hydration).
- Tracks the download via `trackDownload({ source: "hero", platform })` from
  `@/lib/analytics`. **The analytics source is hard-coded `"hero"`** for both Hero and
  Cta usage — siblings do not differentiate. Keep `"hero"` for the SSH page too.
- Renders a `SignatureBadge` directly under the button (signed-binary indicator).

`HeroDownload` takes **no props**. Both Hero and Cta render `<HeroDownload />`
unmodified. **Do not** create a custom CTA button or a wrapper around it.

The secondary "View on GitHub →" link is a plain `<a>` to `REPO_URL` with the
`ArrowRight` icon (`w-3.5 h-3.5`). Hero uses class
`inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 …`; Cta uses the
slightly smaller `text-[13px] text-gray-500 …`. Copy verbatim — see Hero §2.1 and Cta
§2.8.

---

## 9. `page.tsx` file (canonical template)

Drop-in template for `website/app/ssh-terminal-for-mac/page.tsx`:

```tsx
import type { Metadata } from "next";
import { SSH_TERMINAL_MAC_PATH } from "@/lib/links";
import Benefits from "./_components/benefits";
import Comparison from "./_components/comparison";
import Cta from "./_components/cta";
import Faq from "./_components/faq";
import Features from "./_components/features";
import Hero from "./_components/hero";
import Problem from "./_components/problem";
import Workflows from "./_components/workflows";

export const metadata: Metadata = {
  title: "<filled in by content-architect>",
  description: "<filled in by content-architect>",
  keywords: [/* filled in by content-architect */],
  alternates: { canonical: SSH_TERMINAL_MAC_PATH },
  openGraph: {
    title: "<…>",
    description: "<…>",
    type: "website",
    url: SSH_TERMINAL_MAC_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "<…>",
    description: "<…>",
  },
};

export default function SshTerminalForMacPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Features />
      <Benefits />
      <Workflows />
      <Comparison />
      <Faq />
      <Cta />
    </>
  );
}
```

Page imports use **relative paths** (`./_components/...`) for section components, and
the `@/` alias only for shared primitives and `lib`. Match this convention exactly.

---

## 10. Style fragments (copy-paste cheat sheet)

These class strings appear identically across every sibling. Copy them verbatim — do
not "improve" them.

### 10.1 Section wrappers

| Section     | Outer `<section>`                          | Inner `<div>`                       |
|-------------|--------------------------------------------|-------------------------------------|
| Hero        | `pt-28 sm:pt-40 pb-12 sm:pb-20 text-center` | `max-w-4xl mx-auto px-6`           |
| Problem     | `py-20 sm:py-24`                           | `max-w-5xl mx-auto px-6`            |
| Features    | `py-20 sm:py-24`                           | `max-w-3xl mx-auto px-6`            |
| Benefits    | `py-20 sm:py-24`                           | `max-w-3xl mx-auto px-6`            |
| Workflows   | `py-20 sm:py-24`                           | `max-w-3xl mx-auto px-6`            |
| Comparison  | `py-20 sm:py-24`                           | `max-w-4xl mx-auto px-6`            |
| Faq         | `py-20 sm:py-24`                           | `max-w-3xl mx-auto px-6`            |
| Cta         | `py-20 sm:py-24 text-center`               | `max-w-3xl mx-auto px-6`            |

### 10.2 Hero `<h1>`

```
text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]
bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500
dark:from-white dark:via-gray-200 dark:to-gray-500
bg-clip-text text-transparent
```

### 10.3 Cta `<h2>`

```
text-3xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]
bg-gradient-to-br from-gray-900 via-gray-700 to-gray-500
dark:from-white dark:via-gray-200 dark:to-gray-500
bg-clip-text text-transparent
```

### 10.4 Eyebrow paragraph (used in Hero only — `SectionHeader` handles eyebrows
elsewhere)

```
text-xs font-medium uppercase tracking-[0.25em] text-gray-400 dark:text-gray-500 mb-6
```

### 10.5 Body / subtitle paragraph

```
text-base sm:text-lg text-gray-400 dark:text-gray-500 max-w-xl mx-auto leading-relaxed tracking-wide
```

### 10.6 Inline `<code>`

```
text-xs
```

### 10.7 Comparison highlight (lpm column)

Header & cells: `bg-gray-100/70 dark:bg-white/[0.04]`
Header text: `text-gray-900 dark:text-white`
Mobile lpm card border: `border-gray-300 dark:border-gray-700`

---

## 11. Acceptance checklist for the page-integrator

- [ ] `website/app/ssh-terminal-for-mac/page.tsx` exists with the 8 ordered sections.
- [ ] All 8 `_components/*.tsx` files created, each a default export.
- [ ] `metadata` exports `title` ≤ 60 chars, `description` ≈ 150–165 chars, 18–20
      keywords ending in `"lpm"` and `"local project manager"`.
- [ ] `alternates.canonical` and `openGraph.url` both reference `SSH_TERMINAL_MAC_PATH`.
- [ ] `SSH_TERMINAL_MAC_PATH` added to `website/lib/links.ts`.
- [ ] Sitemap entry added in `website/app/sitemap.ts` (priority 0.8, monthly).
- [ ] Footer Guides nav adds 4th link (`SSH_TERMINAL_MAC_PATH`).
- [ ] **Top nav unchanged** — no SSH link in `nav.tsx` / `nav-mobile-menu.tsx`.
- [ ] Comparison: `lpm` is column 1, highlighted, plus 5 SSH-relevant alternatives.
- [ ] Faq emits `FAQPage` JSON-LD inline. 6 Q&A items. No global JSON-LD added.
- [ ] No new shared primitives created. Only `SectionHeader`, `FeatureCard`,
      `HeroDownload`, lucide icons used.
- [ ] No real hosts/IPs/paths/emails anywhere in copy. Generic placeholders only.
- [ ] `_copy.md` written following §5 outline; voice matches §5.2.
