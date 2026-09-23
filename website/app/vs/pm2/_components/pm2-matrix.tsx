import { FeatureMatrix, type MatrixRow } from "@/components/vs/feature-matrix";

const ROWS: MatrixRow[] = [
  {
    label: "Services keep running after you close the app",
    lpm: true,
    competitor: true,
  },
  {
    label: "Every service in its own live pane instead of one log stream",
    lpm: true,
    competitor: "pm2 logs",
  },
  { label: "Switch between projects visually", lpm: true, competitor: false },
  {
    label: "Checks declared ports before starting and names the holder",
    lpm: "ask, free, or fail",
    competitor: false,
  },
  {
    label: "Declares service start order",
    lpm: "dependsOn",
    competitor: false,
  },
  { label: "Named service subsets", lpm: "profiles", competitor: "--only" },
  {
    label: "Wait for a port or a service from a script",
    lpm: "lpm wait --port 3000",
    competitor: false,
  },
  {
    label: "Copy the whole stack for a second agent",
    lpm: "up to 50 worktrees or standalone copies",
    competitor: false,
  },
  {
    label: "Runs Claude Code and Codex in panes beside the services",
    lpm: true,
    competitor: false,
  },
  {
    label: "Runs Node, Python, shell commands and binaries",
    lpm: true,
    competitor: true,
  },
  {
    label: "Cluster mode across CPU cores with load balancing",
    lpm: false,
    competitor: true,
  },
  {
    label: "Auto-restart on crash with backoff and memory limits",
    lpm: "stays down; the pane keeps its last output",
    competitor: true,
  },
  {
    label: "Comes back after a reboot (pm2 startup / pm2 save)",
    lpm: false,
    competitor: true,
  },
  { label: "Zero-downtime reload on deploy", lpm: false, competitor: true },
  {
    label: "Log files and rotation",
    lpm: "live scrollback only",
    competitor: "pm2-logrotate",
  },
  {
    label: "CPU and memory dashboard",
    lpm: false,
    competitor: "pm2 monit, PM2 Plus",
  },
  {
    label: "Scriptable from a shell, with JSON for the caller",
    lpm: "lpm CLI, --json on nearly every verb",
    competitor: "pm2 CLI",
  },
];

export function Pm2Matrix() {
  return (
    <FeatureMatrix
      id="matrix"
      title="PM2 and lpm, row by row"
      description="Six of these rows go to PM2. Each one is a production problem — cluster mode, crash recovery, boot persistence — rather than a local-dev one."
      competitorName="PM2"
      rows={ROWS}
      footnote={
        <>
          There is no logs directory.{" "}
          <code className="font-mono text-xs whitespace-nowrap">lpm logs api --lines 500</code>{" "}
          reads that service pane&apos;s scrollback, so what you get back is
          always current — and when the pane goes, the history goes with it. For
          output you can still read next week, PM2&apos;s log files plus
          pm2-logrotate remain the right tool.
        </>
      }
    />
  );
}
