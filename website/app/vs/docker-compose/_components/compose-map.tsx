import Link from "next/link";
import { CommandMap, type CommandMapRow } from "@/components/vs/command-map";
import { CONFIG_PATH } from "@/lib/links";

const ROWS: CommandMapRow[] = [
  {
    from: "docker compose up",
    to: "lpm start",
    note: "every service in the default profile, one pane each",
  },
  {
    from: "docker compose up web",
    to: "lpm service web start",
  },
  {
    from: "docker compose --profile full up",
    to: "lpm start --profile full",
  },
  {
    from: "docker compose down",
    to: "lpm stop",
  },
  {
    from: "docker compose ps",
    to: "lpm project <name>",
    note: "services, terminals, actions, live status",
  },
  {
    from: "docker compose ls",
    to: "lpm list",
    note: "every project, its running state and service counts",
  },
  {
    from: "docker compose logs -f web",
    to: "lpm logs web",
    note: "prints that pane's recent output; the live follow is the pane itself",
  },
  {
    from: "docker compose run --rm web bin/rails db:migrate",
    to: "an action, or lpm run migrate",
  },
  {
    from: "depends_on:",
    to: "dependsOn:",
    note: "start order; cycles are rejected when the config is validated",
  },
  {
    from: "healthcheck + condition: service_healthy",
    to: "lpm wait --port 5432",
    note: "an explicit gate rather than a condition on the dependency",
  },
  {
    from: "profiles:",
    to: "profiles:",
    note: "same idea, same name",
  },
  {
    from: "environment:",
    to: "env:",
    note: "per service",
  },
  {
    from: 'ports: "3000:3000"',
    to: "port: 3000 + portConflict: ask | free | fail",
    note: "not a mapping — the process binds the host port itself; declaring it lets lpm check the port first and name the process holding it",
  },
  {
    from: "committed docker-compose.yml",
    to: "committed .lpm.yml",
    note: "merged underneath each developer's own project file, which also holds what lpm detected when they added the folder",
  },
];

export function ComposeMap() {
  return (
    <CommandMap
      id="map"
      eyebrow="Migration"
      title="Every compose command, and what you type instead"
      description="You do not have to move the whole file. This is the mapping for the parts you do move."
      fromLabel="docker compose"
      toLabel="lpm"
      rows={ROWS}
      footnote={
        <>
          The lpm column splits in two.{" "}
          <code className="font-mono text-xs">lpm start</code>,{" "}
          <code className="font-mono text-xs">lpm stop</code> and a service
          restart are requests to the open lpm window — that is where the panes
          live, and closing it leaves the services you already started running.{" "}
          <code className="font-mono text-xs">lpm list</code> and{" "}
          <code className="font-mono text-xs">lpm logs</code>{" "}
          read those services with the window shut. Every field on the right —{" "}
          <code className="font-mono text-xs">profiles</code>,{" "}
          <code className="font-mono text-xs">dependsOn</code>,{" "}
          <code className="font-mono text-xs">env</code> and{" "}
          <code className="font-mono text-xs">portConflict</code>{" "}
          — is in the{" "}
          <Link
            href={CONFIG_PATH}
            className="font-medium underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
          >
            config reference
          </Link>
          .
        </>
      }
    />
  );
}
