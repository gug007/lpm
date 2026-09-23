import type { DemoService, OutputLine } from "./projects";
import type { NewProjectInput } from "./add-project-modal";

// What the app writes for a folder whose files name nothing it can run: one
// placeholder service to replace — projects_crud.rs's dev_services.
const PLACEHOLDER_SERVICE: DemoService = {
  name: "dev",
  cmd: "echo 'configure me'",
  output: [
    { text: "$ echo 'configure me'", color: "green", delay: 50 },
    { text: "configure me", delay: 300 },
  ],
};

const run = (cmd: string): OutputLine => ({
  text: `$ ${cmd}`,
  color: "green",
  delay: 50,
});

const nextWeb = (cmd: string): DemoService => ({
  name: "web",
  cmd,
  port: 3000,
  output: [
    run(cmd),
    { text: "", delay: 150 },
    { text: "  ▲ Next.js 16.3.0", color: "muted", delay: 250 },
    { text: "  - Local:        http://localhost:3000", color: "muted", delay: 300 },
    { text: "", delay: 340 },
    { text: " ✓ Ready in 911ms", color: "cyan", delay: 950 },
  ],
  loop: {
    line: { text: "GET / 200 in 42ms", color: "muted", delay: 0 },
    intervalMs: 3600,
  },
});

// The services detect/ would read off each folder the picker offers, named
// and ported the way it names them. A folder missing from this map has
// nothing detectable and gets the placeholder.
const BY_FOLDER: Record<string, DemoService[]> = {
  "saas-app": [nextWeb("pnpm dev")],
  "client-portal": [nextWeb("npm run dev")],
  "docs-site": [
    {
      name: "web",
      cmd: "pnpm dev",
      port: 4321,
      output: [
        run("pnpm dev"),
        { text: "", delay: 150 },
        { text: " 🚀  astro  v4.8.3 started in 588ms", color: "magenta", delay: 700 },
        { text: "", delay: 750 },
        { text: "  ┃ Local    http://localhost:4321/", color: "cyan", delay: 800 },
      ],
    },
  ],
  "auth-service": [
    {
      name: "server",
      cmd: "go run ./cmd/server",
      output: [
        run("go run ./cmd/server"),
        { text: "loading config from env", color: "muted", delay: 450 },
        { text: "server listening on :8080", color: "cyan", delay: 900 },
      ],
    },
    {
      name: "compose",
      cmd: "docker compose up",
      output: [
        run("docker compose up"),
        { text: "[+] Running 1/1", color: "muted", delay: 500 },
        { text: " ✔ Container auth-service-postgres-1  Started", color: "green", delay: 900 },
        { text: "postgres-1  | database system is ready to accept connections", color: "muted", delay: 1400 },
      ],
    },
  ],
  "mobile-app": [
    {
      name: "app",
      cmd: "pnpm start",
      output: [
        run("pnpm start"),
        { text: "Starting Metro Bundler", color: "muted", delay: 650 },
        { text: "› Metro waiting on exp://192.168.1.24:8081", color: "cyan", delay: 950 },
      ],
    },
  ],
};

// A cloned repository is read the same way once it lands on disk; the demo
// has no repo to read, so it stands in with the most common result.
const CLONED: DemoService[] = [nextWeb("npm run dev")];

const SSH_SHELL = (host: string): DemoService => ({
  name: "shell",
  cmd: 'exec "$SHELL" -l',
  output: [
    run('exec "$SHELL" -l'),
    { text: `${host}:~$`, color: "cyan", delay: 500 },
  ],
});

// SSH projects are never scanned: the app gives each one a login shell.
export function servicesFor(input: NewProjectInput): DemoService[] {
  if (input.kind === "ssh") return [SSH_SHELL(input.host ?? "remote")];
  if (input.kind === "clone") return CLONED;
  return BY_FOLDER[input.name] ?? [PLACEHOLDER_SERVICE];
}

// The app's "Found N services: …" notice (adoptProject.ts), shown only when
// something was detected — never for the placeholder or an SSH shell.
export function detectionNotice(
  input: NewProjectInput,
  services: DemoService[],
): string | null {
  if (input.kind === "ssh") return null;
  if (services.length === 1 && services[0] === PLACEHOLDER_SERVICE) return null;
  const noun = services.length === 1 ? "service" : "services";
  return `Found ${services.length} ${noun}: ${services.map((s) => s.name).join(", ")}`;
}
