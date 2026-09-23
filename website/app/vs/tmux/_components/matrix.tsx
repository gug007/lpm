import Link from "next/link";
import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";
import { PROJECT_SIDEBAR_PATH } from "@/lib/links";

const ROWS: MatrixRow[] = [
  {
    label: "One command brings the whole project up",
    lpm: "Start button; lpm start myapp needs lpm running",
    competitor: "via tmuxinator",
  },
  {
    label: "Service list drafted from your repo, then yours to edit",
    lpm: "package.json, Procfile, Gemfile, go.mod, compose and more, read as you add it",
    competitor: false,
  },
  {
    label: "Redrafts the whole config with your own agent CLI",
    lpm: "Claude Code, Codex, Gemini CLI or OpenCode",
    competitor: false,
  },
  {
    label: "One live pane per service",
    lpm: true,
    competitor: true,
  },
  {
    label: "Scrollback kept per service pane",
    lpm: "10,000 lines, and no setting to change it",
    competitor: "2,000 by default, raise it with history-limit",
  },
  {
    label: "Restart one service without touching the others",
    lpm: "lpm service web restart",
    competitor: "respawn-pane by hand",
  },
  {
    label: "Services keep running after you quit the app",
    lpm: true,
    competitor: true,
  },
  {
    label: "Your own shells survive a restart too",
    lpm: "tabs come back; Claude Code and Codex resume their conversation, shells start fresh",
    competitor: true,
  },
  {
    label: "Restarts a crashed service automatically",
    lpm: false,
    competitor: false,
  },
  {
    label: "Which agent needs you, shown on its own tab",
    lpm: "working, needs you, done or error, from Claude Code and Codex",
    competitor: false,
  },
  {
    label: "Runs with no tmux installed",
    lpm: true,
    competitor: false,
  },
  {
    label: "Switch projects from a sidebar that remembers them",
    lpm: true,
    competitor: "via tmuxinator",
  },
  {
    label: "Attach a remote box and run its services in the same window",
    lpm: "from the Mac app",
    competitor: "on the box itself",
  },
  {
    label: "Remap every key and script custom layouts in a config file",
    lpm: "three remappable app hotkeys, plus a shortcut per action",
    competitor: "via .tmux.conf",
  },
  {
    label: "Where you install it",
    lpm: "a Mac app; a Linux box joins as a remote host",
    competitor: "on each Unix box you use it on",
  },
];

export default function Matrix() {
  return (
    <FeatureMatrix
      id="matrix"
      title="Where each tool earns its keep"
      description="tmux wins on persistence, portability and raw scriptability; lpm wins on projects, a drafted config and a desktop app. Three rows below go to tmux outright — your own shells across a restart, keys and layouts in a config file, and where you install each tool — and one goes to neither."
      competitorName="tmux"
      rows={ROWS}
      footnote={
        <>
          The sidebar remembers the projects you add, the folders you put them in
          and the order you leave them — there is more on{" "}
          <Link
            href={PROJECT_SIDEBAR_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            the project sidebar
          </Link>
          .
        </>
      }
    />
  );
}
