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

const PATH = vsPath("docker-compose");

export const metadata: Metadata = {
  title: "lpm vs Docker Compose",
  description:
    "Native dev, without container overhead. Honest comparison of lpm and Docker Compose for running your Rails, Next.js, Go, or Python stack locally.",
  keywords: [
    "docker compose alternative for dev",
    "docker compose vs lpm",
    "dev without docker",
    "native dev process manager",
    "docker compose macos slow",
    "local dev without containers",
    "rails without docker",
    "next.js without docker",
    "docker compose for local development",
    "lpm",
    "local project manager",
  ],
  alternates: { canonical: PATH },
  openGraph: {
    title: "lpm vs Docker Compose",
    description:
      "Run your Rails, Next.js, Go, or Python stack natively with per-service panes and a visual project switcher — or drive Docker Compose through lpm. Honest comparison.",
    type: "website",
    url: PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "lpm vs Docker Compose",
    description:
      "Native dev, without container overhead. Or run compose through lpm — they're not mutually exclusive.",
  },
};

const MATRIX_ROWS: MatrixRow[] = [
  {
    label: "Starts a multi-service dev stack in one command",
    lpm: true,
    competitor: true,
  },
  {
    label: "Runs services natively on the host",
    lpm: true,
    competitor: false,
  },
  {
    label: "Containerized service isolation",
    lpm: false,
    competitor: true,
  },
  {
    label: "Cold start after a code change",
    lpm: "native speed",
    competitor: "container rebuild",
  },
  {
    label: "macOS file I/O speed for mounted source",
    lpm: "native FS",
    competitor: "volume sync overhead",
  },
  {
    label: "Per-service live output pane in a native app",
    lpm: true,
    competitor: "docker compose logs",
  },
  {
    label: "Visual project switcher across multiple repos",
    lpm: true,
    competitor: false,
  },
  {
    label: "Prod-parity service versions (Postgres 15.3, Redis 7.2, etc.)",
    lpm: "use host versions",
    competitor: true,
  },
  {
    label: "Reproducible across team machines and OSes",
    lpm: "partial",
    competitor: true,
  },
  {
    label: "Auto-detects docker-compose.yml and can run it",
    lpm: true,
    competitor: true,
  },
  {
    label: "Designed for parallel AI coding agents on host",
    lpm: true,
    competitor: false,
  },
  {
    label: "Native macOS desktop app + CLI with shared config",
    lpm: true,
    competitor: "CLI only",
  },
  {
    label: "Open source, free",
    lpm: true,
    competitor: true,
  },
];

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Can I use lpm and Docker Compose together?",
    answer:
      "Yes, and this is the common case. lpm auto-detects docker-compose.yml in a project and can run compose up as one of your services alongside native processes. So you can keep Postgres and Redis in containers for prod parity while running your Rails or Next.js app natively, and watch every pane — container logs included — in the same desktop app. They are not mutually exclusive.",
  },
  {
    question: "Does lpm replace Docker Compose?",
    answer:
      "For some workflows, yes; for others, no. If you're a solo or small-team dev doing native work on macOS and Compose was mostly a way to launch a process tree, lpm covers that with per-service panes and multi-project switching. If you rely on Compose for prod-parity service versions, cross-OS team reproducibility, or container-first deploy pipelines, keep using Compose. lpm doesn't try to be a container runtime.",
  },
  {
    question: "Why would I run things natively instead of in containers on macOS?",
    answer:
      "Speed, mostly. Docker Desktop on macOS runs a Linux VM and shares your source over a virtualized filesystem, which adds latency to file watching, bundle installs, test runs, and hot reloads. Native processes read your disk directly. Cold start is also instant — no image build, no container create, no volume mount. For the inner dev loop on one machine, native is usually faster; for prod parity and team reproducibility, containers are usually better.",
  },
  {
    question: "Can I run Claude Code or Codex against services lpm started?",
    answer:
      "Yes, and that's a big part of why lpm exists. Agents run natively on your host and talk to whichever services lpm brought up — native processes, compose-backed services, or a mix. Each project gets its own entry in the desktop app with live panes per service, so you can run one agent against one project and another agent against a duplicated project without them fighting over ports or tabs.",
  },
  {
    question: "If I have a docker-compose.yml today, what does migrating look like?",
    answer: (
      <>
        You don&apos;t have to fully migrate. Point lpm at the repo, it detects the
        compose file, and you can run the whole graph via{" "}
        <code>docker compose up</code> as one lpm service. From there you can
        incrementally move native-friendly processes — your Rails server, your
        Next.js dev server, a Go binary — out of the compose file and into lpm
        as native services, while leaving stateful infra like Postgres and
        Redis in Compose. Keep whatever split makes sense. The source is on{" "}
        <a
          href={REPO_URL}
          className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          GitHub
        </a>{" "}
        if you want to see how the config reads.
      </>
    ),
    answerText: `You don't have to fully migrate. Point lpm at the repo, it detects the compose file, and you can run the whole graph via "docker compose up" as one lpm service. From there you can incrementally move native-friendly processes — your Rails server, your Next.js dev server, a Go binary — out of the compose file and into lpm as native services, while leaving stateful infra like Postgres and Redis in Compose. Keep whatever split makes sense. The source is on GitHub at ${REPO_URL} if you want to see how the config reads.`,
  },
];

export default function LpmVsDockerComposePage() {
  return (
    <>
      <ComparisonHero
        eyebrow="lpm vs Docker Compose"
        title="Native dev, without container overhead."
        description="Docker Compose is excellent for prod parity and cross-team reproducibility. lpm is about the daily native dev loop on one machine — with per-service panes, a project switcher, and room for AI agents alongside your stack."
      />

      <FeatureMatrix
        title="Docker Compose and lpm, feature by feature"
        description="Different jobs. Rows where Compose clearly wins are called out honestly — nothing here is a dunk."
        competitorName="Docker Compose"
        rows={MATRIX_ROWS}
      />

      <WhenToPick
        title="When each one is the right tool"
        description="A friendly split. If your daily loop is native code running on your laptop, lpm leans in. If your daily loop depends on containerized infra matching prod, Compose still wins."
        lpm={{
          name: "lpm",
          headline:
            "You want fast native startup, per-service panes, and space for AI agents next to your stack.",
          points: [
            "You do most of your dev natively on macOS and Docker volume sync has been slowing you down.",
            "You want your Rails server, Next.js frontend, worker, and a Redis process each in their own live pane.",
            "You juggle multiple projects and want a visual switcher instead of remembering which compose file is running where.",
            "You run Claude Code, Codex, or Cursor in parallel on the same or adjacent codebases and want their output visible alongside your services.",
            "You already have a docker-compose.yml — lpm can drive it as one service while you move the rest native.",
            "You want a native macOS desktop app plus a CLI that share the same config.",
          ],
        }}
        competitor={{
          name: "Docker Compose",
          headline:
            "You need prod parity, team reproducibility, or real container isolation for local dev.",
          points: [
            "Your production runs on containers and you want dev to match the exact Postgres, Redis, or Kafka versions.",
            "Your team spans macOS, Linux, and Windows and reproducible local infra matters more than startup speed.",
            "You rely on complex service networking, named volumes, or health checks that Compose expresses cleanly.",
            "You want strong isolation — each service in its own container, its own filesystem, its own network namespace.",
            "Your CI, staging, and prod pipelines are container-based and your dev environment should stay in that ecosystem.",
          ],
        }}
      />

      <Faq
        title="Switching from — or alongside — Docker Compose"
        items={FAQ_ITEMS}
      />

      <Cta
        title="Keep compose where it earns it. Go native everywhere else."
        description="Fast startup, per-service panes, multi-project switching, and AI agents on your host — with your docker-compose.yml still welcome. Free and open source."
      />
    </>
  );
}
