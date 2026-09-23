import Link from "next/link";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { WORKTREE_AGENTS_PATH } from "@/lib/links";

const ROWS: MatrixRow[] = [
  {
    label: "Starts a multi-service dev stack in one command",
    lpm: "click Start, or lpm start with the app open",
    competitor: true,
  },
  {
    label: "Declares startup order between services",
    lpm: "dependsOn",
    competitor: "order + health gate",
  },
  {
    label: "Time from start to services listening",
    lpm: "process start",
    competitor: "container create + start",
  },
  {
    label: "Rebuild needed when dependencies change",
    lpm: "reinstall",
    competitor: "image rebuild",
  },
  {
    label: "Reads your source straight off the host filesystem",
    lpm: true,
    competitor: "through the VM's file sharing",
  },
  {
    label: "Containerized service isolation",
    lpm: false,
    competitor: true,
  },
  {
    label: "Pins the exact service version the team runs",
    lpm: "whatever is installed on the host",
    competitor: "pinned by image tag",
  },
  {
    label: "Identical runtimes on every teammate's machine",
    lpm: false,
    competitor: true,
  },
  {
    label: "Own network namespace, so two projects can both use 5432",
    lpm: false,
    competitor: true,
  },
  {
    label: "A live pane per service, open the whole time you work",
    lpm: true,
    competitor: "docker compose logs, or a container's Logs tab in Docker Desktop",
  },
  {
    label: "Checks a declared port before start and names what holds it",
    lpm: "ask, free, or fail",
    competitor: "no pre-start check documented",
  },
  {
    label: "Starts, stops and switches between many repos from one window",
    lpm: true,
    competitor:
      "docker compose ls lists them; switching means changing directory",
  },
  {
    label: "Service graph committed to the repo",
    lpm: ".lpm.yml",
    competitor: "docker-compose.yml",
  },
  {
    label: "Turns your compose file into something it runs",
    lpm: "adds docker compose up as a service when you add the folder",
    competitor: "that file is compose's own input",
  },
  {
    label: "Your coding agent gets a tab next to the service panes",
    lpm: "Claude Code and Codex report Working, Needs you or Done",
    competitor: "the agent runs in a terminal you open yourself",
  },
  {
    label: "Free to use inside a large company",
    lpm: "MIT, at any company size",
    competitor:
      "Compose is Apache-2.0; Docker Desktop needs a paid subscription above Docker's size threshold",
  },
];

export function ComposeMatrix() {
  return (
    <FeatureMatrix
      id="matrix"
      title="Docker Compose and lpm, row by row"
      description="Five rows go to Compose: container isolation, identical runtimes and a network namespace of its own outright, plus health-gated start order and pinned image versions on substance. Those five are why the split-stack setup below exists."
      competitorName="Docker Compose"
      rows={ROWS}
      footnote={
        <>
          Isolation is where the concessions above bite hardest, and this is the
          exact position when a second agent needs the same project: copy it and
          the copy edits its own files, so two agents never save over each
          other. Nothing else is namespaced — one host, one set of ports, one
          Postgres — and lpm checks a declared port before the project starts,
          then tells you which process is holding it. A linked worktree starts
          from the tracked files only: an ignored{" "}
          <code className="font-mono text-xs">.env</code>{" "}
          is not in it, and Node packages are installed only if you turn on
          Install dependencies.{" "}
          <Link
            href={WORKTREE_AGENTS_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            How the copies work
          </Link>
          .
        </>
      }
    />
  );
}
