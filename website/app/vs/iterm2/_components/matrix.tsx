import Link from "next/link";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { vsPath } from "@/lib/links";

const ROWS: MatrixRow[] = [
  {
    label: "Start every service in a project with one command",
    lpm: "one click, or lpm start from any shell with the app open",
    competitor: "you run each command yourself",
  },
  {
    label: "Listening ports on each service tab",
    lpm: "the ports that service's process tree owns",
    competitor: false,
  },
  {
    label: "Dev servers keep running once the window is gone",
    lpm: "its own session layer — tmux is neither used nor needed",
    competitor: "only if you started them under tmux",
  },
  {
    label: "Bring up the frontend only, and leave the rest down",
    lpm: "a named profile in the project file",
    competitor: "its profiles set the shell and the appearance, not a set of services",
  },
  {
    label: "Lint, migrate or seed without retyping the command",
    lpm: "action buttons in the project, or lpm run",
    competitor: "shell history and aliases",
  },
  {
    label: "Copy a repo for a parallel agent",
    lpm: "up to 50 linked worktrees or standalone copies",
    competitor: false,
  },
  {
    label: "Seeing what an agent is doing without switching to it",
    lpm: "working, needs you, done or error on the terminal tab — Claude Code and Codex",
    competitor:
      "working, waiting or idle in the Session Status panel — Claude Code only, since 3.7",
  },
  {
    label: "Project control from any shell or agent",
    lpm: "the lpm command, with --json for whatever reads it",
    competitor: "Python API",
  },
  {
    label: "Emulator scripting: triggers, smart selection, output hooks",
    lpm: false,
    competitor: true,
  },
  {
    label: "tmux control mode rendered as native tabs",
    lpm: false,
    competitor: true,
  },
  {
    label: "Scrollback you can raise, or leave unbounded",
    lpm: "10,000 lines a pane, fixed",
    competitor: "as many lines as you set, or unlimited",
  },
  {
    label: "Licence and price",
    lpm: "MIT, free",
    competitor: "GPLv2, free",
  },
];

export function Matrix() {
  return (
    <FeatureMatrix
      id="matrix"
      title="iTerm2 and lpm, feature by feature"
      description="Twelve rows. Three of them go to iTerm2 — scrollback, emulator scripting, control mode — and one of those three is the reason to keep it."
      competitorName="iTerm2"
      rows={ROWS}
      footnote={
        <>
          If control mode is the row that decides it, the{" "}
          <Link
            href={vsPath("tmux")}
            className="font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            tmux comparison
          </Link>{" "}
          covers what lpm runs instead of a multiplexer.
        </>
      }
    />
  );
}
