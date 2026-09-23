import { CommandMap, type CommandMapRow } from "@/components/vs/command-map";

const ROWS: CommandMapRow[] = [
  {
    from: "tmuxinator start myapp",
    to: "lpm start myapp",
    note: "Or press Start on the project.",
  },
  {
    from: "tmux ls",
    to: "lpm list",
    note: "Running state and service counts, plus agents when lpm is up.",
  },
  {
    from: "tmux attach -t myapp",
    to: "click the project in the sidebar",
  },
  {
    from: "tmux kill-session -t myapp",
    to: "lpm stop myapp",
  },
  {
    from: "tmux capture-pane -p -t myapp:web",
    to: "lpm logs web -n 200",
    note: "Trailing lines of that service's pane.",
  },
  {
    from: "respawn one pane",
    to: "lpm service web restart",
    note: "The other services keep running.",
  },
  {
    from: "set -g history-limit 2000",
    to: "nothing to set; 10,000 lines per pane",
  },
  {
    from: "—",
    to: "lpm wait --port 3000",
    note: "Block a script until the stack is listening.",
  },
];

export default function Commands() {
  return (
    <CommandMap
      eyebrow="Command map"
      title="What you type instead"
      description="The tmux and tmuxinator lines a dev stack actually uses, next to the lpm line that does the same job."
      fromLabel="tmux / tmuxinator"
      toLabel="lpm"
      rows={ROWS}
      footnote={
        <>
          These fall into two groups.{" "}
          <code className="font-mono text-xs">lpm start</code>,{" "}
          <code className="font-mono text-xs">lpm stop</code> and{" "}
          <code className="font-mono text-xs">lpm service … restart</code> hand
          the work to the app, and{" "}
          <code className="font-mono text-xs">lpm status</code> asks it what your
          agents are doing — so those four want lpm open.{" "}
          <code className="font-mono text-xs">lpm list</code>,{" "}
          <code className="font-mono text-xs">lpm logs</code> and{" "}
          <code className="font-mono text-xs whitespace-nowrap">lpm wait --port</code> read your
          running services themselves, from any shell, whether lpm is up or not.
        </>
      }
    />
  );
}
