import Link from "next/link";
import { CommandMap, type CommandMapRow } from "@/components/vs/command-map";
import { CONNECT_AGENTS_PATH } from "@/lib/links";

const ROWS: CommandMapRow[] = [
  { from: "pm2 start ecosystem.config.js", to: "lpm start myapp" },
  { from: "pm2 start … --only web", to: "lpm start myapp --profile dev" },
  { from: "pm2 list", to: "lpm list" },
  { from: "pm2 show web", to: "lpm project myapp" },
  { from: "pm2 logs web --lines 200", to: "lpm logs web --lines 200" },
  { from: "pm2 restart web", to: "lpm service web restart" },
  { from: "pm2 stop all", to: "lpm stop myapp" },
  {
    from: "pm2 monit",
    to: "no equivalent",
    note: "lpm shows panes, not resource graphs",
  },
  { from: "pm2 startup / pm2 save", to: "no equivalent" },
  {
    from: "—",
    to: "lpm wait --port 3000 --timeout 60",
    note: "hold a script until the port is listening",
  },
  {
    from: "—",
    to: 'lpm duplicate myapp -n 3 --run claude --prompt "…"',
    note: "three copies, each running its own agent",
  },
  {
    from: "—",
    to: "lpm worktree myapp -n 3",
    note: "three linked Git worktrees instead — untracked files like .env and node_modules stay behind",
  },
];

export function VerbMap() {
  return (
    <CommandMap
      id="map"
      eyebrow="Muscle memory"
      title="Every pm2 verb, and what it is here"
      description="The verbs line up almost one to one. Two of them have no lpm equivalent, and three lpm verbs have no pm2 original."
      fromLabel="pm2"
      toLabel="lpm"
      rows={ROWS}
      footnote={
        <>
          <code className="font-mono">lpm start</code> and{" "}
          <code className="font-mono">lpm stop</code>, and any{" "}
          <code className="font-mono">lpm service web restart</code>, need the
          app up: the panes belong to it, so a shell with lpm quit gets
          &ldquo;lpm app is not running&rdquo; instead. Reading is looser —{" "}
          <code className="font-mono">lpm logs</code>,{" "}
          <code className="font-mono">lpm list</code> and{" "}
          <code className="font-mono">lpm wait --port</code> inspect the
          services themselves. The exception on that side is{" "}
          <code className="font-mono">lpm status</code>: agent status is the
          app&apos;s to report, so it says there is no live status until lpm is
          up again. Every row above is also a line{" "}
          <Link
            href={CONNECT_AGENTS_PATH}
            className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            an agent can run for you
          </Link>
          .
        </>
      }
    />
  );
}
