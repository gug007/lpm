import { CommandMap, type CommandMapRow } from "@/components/vs/command-map";

const ROWS: CommandMapRow[] = [
  { from: "overmind start", to: "lpm start" },
  { from: "overmind start -l web,worker", to: "lpm start --profile api" },
  { from: "overmind restart web", to: "lpm service web restart" },
  { from: "overmind stop worker", to: "lpm service worker stop" },
  {
    from: "overmind connect web",
    to: "click the service's tab in the project, or lpm logs web -n 500",
  },
  {
    from: "overmind echo",
    to: "open the project; each service's output is already in its pane",
  },
  {
    from: "overmind run yarn install",
    to: 'lpm run --command "yarn install"',
    note: "a one-off command in the project's folder",
  },
  {
    from: "overmind kill",
    to: "lpm stop",
    note: "lpm reaps each service's process tree",
  },
  {
    from: "—",
    to: "lpm wait --service web",
    note: "block a script until the service is up",
  },
  {
    from: "—",
    to: 'lpm duplicate -n 3 --run claude --prompt "…"',
    note: "three copies of the project, an agent running in each",
  },
];

const CODE = "font-mono text-[0.9em]";

export function CommandTranslation() {
  return (
    <CommandMap
      eyebrow="Muscle memory"
      title="Every overmind command, translated"
      description="The overmind verbs you type in a day, and what replaces each one. The last two rows have no overmind command to translate."
      fromLabel="overmind"
      toLabel="lpm"
      rows={ROWS}
      footnote={
        <>
          Anything that changes what is running —{" "}
          <code className={CODE}>lpm start</code>,{" "}
          <code className={CODE}>lpm stop</code>, or a{" "}
          <code className={CODE}>lpm service … restart</code> — goes through the
          app, so keep lpm open: it owns the panes.{" "}
          <code className={CODE}>lpm logs</code> and{" "}
          <code className={CODE}>lpm list</code> only read, so they answer from a
          cold shell — <code className={CODE}>lpm list</code> is where you see
          how many services a project has up.
        </>
      }
    />
  );
}
