import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";

const ROWS: MatrixRow[] = [
  {
    label: "Picks up Procfile edits on the next start",
    lpm: "no — imported once, when the project is added",
    competitor: true,
  },
  {
    label: "Automatic PORT allocation",
    lpm: "port declared for conflict checks, not assigned",
    competitor: "PORT stepped per process (-p / -P)",
  },
  {
    label: "Scales one process to several instances",
    lpm: "one process per service",
    competitor: "-m web=2,worker=3",
  },
  {
    label: "Which machines it runs on",
    lpm: "Mac app; Linux and SSH boxes as hosts",
    competitor: "macOS, Linux, *BSD",
  },
  {
    label: "Whether tmux has to be installed first",
    lpm: "no — lpm does not use tmux",
    competitor: "yes — install tmux, then Overmind",
  },
  {
    label: "Reads a config committed in the repo",
    lpm: ".lpm.yml",
    competitor: "Procfile",
  },
  {
    label: "Drafts the config for you",
    lpm: "built in, from the Procfile and other manifests; Claude Code, Codex, Gemini CLI or OpenCode can redraft it",
    competitor: false,
  },
  {
    label: "Type at one running process",
    lpm: false,
    competitor: "overmind connect",
  },
  {
    label: "Restart web without restarting worker",
    lpm: true,
    competitor: true,
  },
  {
    label: "Start order you declare, not line order",
    lpm: "dependsOn",
    competitor: false,
  },
  {
    label: "Start a subset of processes",
    lpm: "--profile",
    competitor: "-l / OVERMIND_PROCESSES",
  },
  {
    label: "Port conflict caught at start, holder named",
    lpm: true,
    competitor: false,
  },
  {
    label: "What a session survives",
    lpm: "quitting the app",
    competitor: "closing the terminal",
  },
  {
    label: "Running it on a remote dev box",
    lpm: "SSH projects, declared ports forwarded to localhost automatically",
    competitor: "run it on the box yourself",
  },
  {
    label: "Run the project in several copies at once",
    lpm: "1–50 worktrees or standalone copies",
    competitor: false,
  },
];

export function Differences() {
  return (
    <FeatureMatrix
      id="matrix"
      title="Where the two tools differ"
      description="Fifteen rows. Five of them go to Overmind — the first four, plus typing at a running process — and those five are the honest reason to stay."
      competitorName="Overmind"
      rows={ROWS}
      footnote={
        <>
          Read the five rows lpm loses twice. Overmind reads your Procfile
          afresh every time it starts where lpm imported it once, hands each
          process a{" "}
          <code className="font-mono text-[0.9em]">PORT</code>, runs several
          instances of one process, installs on Linux and *BSD where lpm needs a
          Mac to drive from, and drops you at a prompt inside a running process
          with{" "}
          <code className="font-mono text-[0.9em]">overmind connect</code>. If
          one of those five is load-bearing, stay where you are — nothing below
          outweighs a workflow that already works.
        </>
      }
    />
  );
}
