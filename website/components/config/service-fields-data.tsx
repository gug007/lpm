import { DocLink } from "./doc-link";
import type { Field } from "./field-table";
import { Strong } from "./strong";

export const serviceFields: Field[] = [
  {
    name: "cmd",
    type: "string",
    required: true,
    description: (
      <>
        The shell command that starts the process — exactly what you&rsquo;d
        type into a terminal yourself, like{" "}
        <code className="font-mono">npm run dev</code>{" "}or{" "}
        <code className="font-mono">node server.js</code>. lpm runs it in the
        background, where it keeps running even after you quit the app, and
        streams its output into a read-only pane. lpm doesn&rsquo;t restart a
        command that exits on its own.
      </>
    ),
  },
  {
    name: "cwd",
    type: "string",
    required: false,
    description: (
      <>
        Start the service from a different folder than the project root — handy
        for monorepos where each app lives in its own subfolder like{" "}
        <code className="font-mono">./apps/web</code>. Relative paths resolve
        from <code className="font-mono">root</code>; absolute paths are used
        as-is. See <DocLink href="#path-resolution">Path resolution</DocLink>{" "}
        for <code className="font-mono">~</code>{" "}and SSH projects.
      </>
    ),
  },
  {
    name: "port",
    type: "int",
    required: false,
    description: (
      <>
        The port this service listens on. It&rsquo;s a label and a conflict
        check, not an assignment: lpm shows it next to the service in the Start
        menu, offers it under Open in browser until it sees the port the
        service actually opened, and checks that nothing else holds it when
        you press Start. lpm doesn&rsquo;t pass it to your command — put the
        port in <code className="font-mono">cmd</code>{" "}or{" "}
        <code className="font-mono">env</code>{" "}yourself.{" "}
        <Strong>Give each service its own port</Strong>{" "}—{" "}
        <code className="font-mono">lpm config validate</code>{" "}flags two
        services that share one.
      </>
    ),
  },
  {
    name: "portConflict",
    type: "string",
    required: false,
    description: (
      <>
        What to do when <code className="font-mono">port</code>{" "}is already
        taken at Start. <code className="font-mono">ask</code>{" "}(the default)
        asks before freeing it, <code className="font-mono">free</code>{" "}frees
        it without asking, and <code className="font-mono">fail</code>{" "}refuses
        to start. Freeing stops the other lpm project holding the port, or ends
        the process that holds it.
      </>
    ),
  },
  {
    name: "env",
    type: "map",
    required: false,
    description: (
      <>
        Extra environment variables to set just for this service — things like{" "}
        <code className="font-mono">API_URL</code>{" "}or{" "}
        <code className="font-mono">NODE_ENV</code>. Useful when you don&rsquo;t
        want to commit them to a <code className="font-mono">.env</code>{" "}file.
      </>
    ),
  },
  {
    name: "dependsOn",
    type: "[]string",
    required: false,
    description: (
      <>
        Other services this one needs — name them here and lpm starts them
        first, pulling them in automatically whenever you start this service
        (even if you only picked this one). It&rsquo;s ordering only: the
        dependencies launch ahead of this service, but lpm doesn&rsquo;t wait
        for them to finish booting or start listening before it moves on. Also
        accepted as <code className="font-mono">depends_on</code>.
      </>
    ),
  },
];
