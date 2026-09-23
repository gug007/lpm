import { DETECTED_EXAMPLE } from "@/app/config/examples";
import { Callout } from "../callout";
import { CodeBlock } from "../code-block";
import { DetectionTable } from "../detection-table";
import { DocLink } from "../doc-link";
import { Lede } from "../lede";
import { Section } from "../section";

export function DetectionSection() {
  return (
    <Section
      id="detection"
      title="Automatic service detection"
      description={
        <>
          When you add a folder or clone a repository, lpm reads the
          project&rsquo;s own files and writes a service for each thing it can
          run. Nothing is sent anywhere and no AI is involved, so adding a
          project stays instant. The app then tells you what it found, like
          &ldquo;Found 2 services: web, api&rdquo;.
        </>
      }
    >
      <Lede title="Where it looks." className="mb-3">
        The project root first, then every workspace member declared in{" "}
        <code className="font-mono">package.json</code>{" "}or{" "}
        <code className="font-mono">pnpm-workspace.yaml</code>, then these
        subfolders if they exist: <code className="font-mono">api</code>,{" "}
        <code className="font-mono">app</code>,{" "}
        <code className="font-mono">backend</code>,{" "}
        <code className="font-mono">client</code>,{" "}
        <code className="font-mono">frontend</code>,{" "}
        <code className="font-mono">server</code>,{" "}
        <code className="font-mono">ui</code>,{" "}
        <code className="font-mono">web</code>,{" "}
        <code className="font-mono">www</code>, and every folder under{" "}
        <code className="font-mono">apps/</code>{" "}or{" "}
        <code className="font-mono">services/</code>.
      </Lede>

      <Lede title="What it recognizes." className="mt-6 mb-3">
        Node commands use the package manager your repo declares or locks.
        Python commands run through the folder&rsquo;s{" "}
        <code className="font-mono">.venv</code>{" "}(or{" "}
        <code className="font-mono">venv</code>), uv, Poetry, or Pipenv when it
        has one.
      </Lede>
      <DetectionTable />

      <Lede title="Names and ports.">
        At the root, a service is named for its role —{" "}
        <code className="font-mono">web</code>,{" "}
        <code className="font-mono">api</code>,{" "}
        <code className="font-mono">app</code>, or the Procfile&rsquo;s process
        name. In a subfolder, a lone service takes the folder&rsquo;s name and a{" "}
        <code className="font-mono">cwd</code>{" "}pointing there;
        several share the folder name as a prefix, like{" "}
        <code className="font-mono">backend-web</code>. A port is written when
        the command names one (<code className="font-mono">--port 3001</code>,{" "}
        <code className="font-mono">PORT=3001</code>,{" "}
        <code className="font-mono">localhost:5173</code>) or the framework has
        a usual dev port. Adding a folder with a Compose file at the root, a
        Django app with its own <code className="font-mono">.venv</code>{" "}in{" "}
        <code className="font-mono">backend/</code>, and a Vite app using pnpm
        in <code className="font-mono">frontend/</code>{" "}writes:
      </Lede>
      <CodeBlock filename="~/.lpm/projects/shop.yml">{DETECTED_EXAMPLE}</CodeBlock>

      <Lede title="Limits." className="mt-6 mb-3">
        Detection stops at 20 services. In a monorepo, the root&rsquo;s own
        script (say, <code className="font-mono">turbo dev</code>) is left out
        once the workspace members turn up services of their own, so nothing
        starts twice. It runs once, when the project is added, and never
        rewrites a config you&rsquo;ve edited.
      </Lede>

      <Callout title="When nothing is found">
        <p>
          lpm writes one placeholder service,{" "}
          <code className="font-mono">dev: echo &apos;configure me&apos;</code>,
          for you to replace — or let an agent draft the whole file with{" "}
          <DocLink href="#editor">Generate with AI</DocLink>. SSH projects are
          never scanned: a new one gets a{" "}
          <code className="font-mono">shell</code>{" "}service that opens a login
          shell on the host. Adding a folder that&rsquo;s already a project
          just points you to that project.
        </p>
      </Callout>
    </Section>
  );
}
