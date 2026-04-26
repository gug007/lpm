import type { Metadata } from "next";
import { ComparisonHero } from "@/components/vs/comparison-hero";
import { Cta } from "@/components/vs/cta";
import { Faq, type FaqItem } from "@/components/vs/faq";
import {
  FeatureMatrix,
  type MatrixRow,
} from "@/components/vs/feature-matrix";
import { WhenToPick } from "@/components/vs/when-to-pick";
import { REPO_URL, vsPath } from "@/lib/links";

const PATH = vsPath("pm2");

export const metadata: Metadata = {
  title: "lpm vs PM2",
  description:
    "PM2 keeps Node apps alive in production. lpm runs your dev loop with per-service panes, multi-project switching, and AI-agent workflows. Honest comparison.",
  keywords: [
    "pm2 alternative dev",
    "pm2 vs lpm",
    "dev process manager",
    "node dev process manager",
    "pm2 for local development",
    "pm2 ecosystem config",
    "node.js process manager",
    "multi-project manager",
    "parallel ai agents",
    "lpm",
    "local project manager",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "lpm vs PM2",
    description:
      "PM2 is for production. lpm is for the dev loop. See where each one is the right tool — honestly, side by side.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm vs PM2",
    description:
      "PM2 is for production. lpm is for the dev loop. Honest side-by-side comparison.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Starts multiple processes with one command",
    lpm: true,
    competitor: true,
  },
  {
    label: "Primary focus",
    lpm: "dev loop",
    competitor: "production",
  },
  {
    label: "Per-service live output pane",
    lpm: true,
    competitor: false,
  },
  {
    label: "Native macOS desktop app",
    lpm: true,
    competitor: false,
  },
  {
    label: "Visual multi-project switcher",
    lpm: true,
    competitor: false,
  },
  {
    label: "Framework auto-detect (Rails, Next.js, Go, Django, Flask, Compose)",
    lpm: true,
    competitor: "Node-focused",
  },
  {
    label: "Duplicate a project for a second AI agent",
    lpm: true,
    competitor: false,
  },
  {
    label: "Designed for Claude Code / Codex in parallel",
    lpm: true,
    competitor: false,
  },
  {
    label: "Cluster mode across CPU cores",
    lpm: false,
    competitor: true,
  },
  {
    label: "Auto-restart on crash with backoff",
    lpm: false,
    competitor: true,
  },
  {
    label: "Runs at server boot (pm2 startup / save)",
    lpm: false,
    competitor: true,
  },
  {
    label: "Zero-downtime reload on deploy",
    lpm: false,
    competitor: true,
  },
  {
    label: "Log rotation and centralized log files",
    lpm: "dev-only",
    competitor: "prod-grade",
  },
  {
    label: "CPU / memory monitoring dashboard",
    lpm: "per-service panes",
    competitor: "pm2 monit + Plus",
  },
  {
    label: "Config format",
    lpm: "YAML name + command",
    competitor: "ecosystem.config.js",
  },
  {
    label: "Open source, free",
    lpm: true,
    competitor: true,
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I use lpm in production instead of PM2?",
    answer:
      "No, and that is not the pitch. lpm is a dev-workflow tool — it starts, stops, and switches between local projects while you are coding. PM2 is a daemon built to keep Node apps alive on a server: cluster mode, auto-restart on crash, pm2 startup for boot, zero-downtime reloads, log rotation. If you are deploying Node to prod or staging, use PM2. lpm and PM2 are complementary, not competitors.",
  },
  {
    question: "Does lpm cluster Node processes across cores like PM2?",
    answer:
      "No. Cluster mode is a production concern — PM2 forks your Node app across CPU cores and load-balances between workers so a single box serves more traffic. lpm doesn't do that. In dev you usually want one instance of each service so logs and debugger breakpoints map to a single process. If you need clustering, that is a signal you want PM2 in front of your app, not lpm.",
  },
  {
    question: "I run non-Node projects — Rails, Django, Go. Does lpm help more than PM2 there?",
    answer:
      "This is where the split is clearest. PM2 can run non-Node commands via its interpreter: \"none\" or bash escape hatch, but the ecosystem, docs, and defaults all assume Node. lpm auto-detects Rails, Next.js, Go, Django, Flask, and Docker Compose as first-class — you point it at the repo, it figures out the services, and each one gets its own live pane. If your stack is mixed or non-Node, lpm is built for that shape.",
  },
  {
    question: "How do I migrate from ecosystem.config.js to lpm?",
    answer:
      "You don't fully migrate — you'd keep ecosystem.config.js for production and add an lpm config for dev. lpm uses a lightweight YAML where each service is name + command, which maps cleanly to the apps array in ecosystem.config.js: take each entry's name and script/args, drop it into the lpm config, and you're running. Env vars, cwd, and ports are handled in the lpm config separately. For many Node projects the framework auto-detect means you don't even need a config.",
  },
  {
    question: "Can I run PM2 under lpm during development?",
    answer: (
      <>
        Yes, and that is a reasonable setup. If your dev environment mirrors
        prod and you want pm2 start ecosystem.config.js locally, make that a
        single service in your lpm config — one line, command{" "}
        <code>pm2-runtime start ecosystem.config.js</code> (the non-daemonized
        variant so lpm owns the lifecycle). You get lpm&apos;s per-project
        switcher and pane UI on the outside, PM2&apos;s cluster / restart
        semantics on the inside. Source is on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>{" "}
        if you want to try it.
      </>
    ),
    answerText: `Yes, and that is a reasonable setup. If your dev environment mirrors prod and you want pm2 start ecosystem.config.js locally, make that a single service in your lpm config — one line, command "pm2-runtime start ecosystem.config.js" (the non-daemonized variant so lpm owns the lifecycle). You get lpm's per-project switcher and pane UI on the outside, PM2's cluster / restart semantics on the inside. Source is on GitHub at ${REPO_URL} if you want to try it.`,
  },
];

export default function LpmVsPm2Page() {
  return (
    <>
      <ComparisonHero
        eyebrow="lpm vs PM2"
        title="PM2 is for production. lpm is for the dev loop."
        description="PM2 is a rock-solid daemon for keeping Node apps alive in prod — clustering, auto-restart, startup scripts. lpm is a workflow tool for starting, stopping, and switching between local projects while you code. Different jobs."
      />

      <FeatureMatrix
        title="PM2 and lpm, feature by feature"
        description="PM2 wins every production row. lpm wins the dev-loop rows. Written honestly so you can tell which column you actually need."
        competitorName="PM2"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="When each one is the right tool"
        description="Both run multiple processes. The split is whether the processes are a product running for users or a stack you're actively editing."
        lpm={{
          name: "lpm",
          headline:
            "You're in the dev loop — multiple projects, mixed stacks, or AI agents running in parallel.",
          points: [
            "You switch between several local projects a day and want a visual switcher instead of terminal tabs.",
            "Your stack is Rails, Next.js, Go, Django, Flask, or Docker Compose — not just Node — and you want first-class framework detection.",
            "You want each service in its own live pane in a native macOS app, not one interleaved log stream.",
            "You run Claude Code, Codex, Cursor, or aider in parallel and need each agent's output visible at once.",
            "You want to duplicate a project so a second agent can work on its own copy of the stack without conflicts.",
          ],
        }}
        competitor={{
          name: "PM2",
          headline:
            "You're shipping a Node app to a server and need it to stay alive under load.",
          points: [
            "You deploy Node to production or staging and need cluster mode across CPU cores with load balancing.",
            "You need auto-restart on crash with exponential backoff, memory limits, and graceful reloads.",
            "You need pm2 startup + pm2 save so the app comes back after a reboot.",
            "You need log rotation, centralized log files, and integrations like PM2 Plus / Keymetrics for monitoring.",
            "You need zero-downtime reloads on deploy without dropping in-flight requests.",
          ],
        }}
      />

      <Faq
        title="lpm vs PM2 — the honest FAQ"
        items={FAQ_ITEMS}
      />

      <Cta
        title="Use PM2 in prod. Use lpm while you're coding."
        description="A dev-loop layer on top of whatever runs your services — per-service panes, multi-project switching, and parallel AI-agent workflows. Free and open source."
      />
    </>
  );
}
