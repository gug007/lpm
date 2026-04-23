export type LineColor =
  | "default"
  | "muted"
  | "green"
  | "cyan"
  | "yellow"
  | "red"
  | "magenta";

export type OutputLine = {
  text: string;
  color?: LineColor;
  delay: number;
};

export type DemoService = {
  name: string;
  cmd: string;
  port?: number;
  output: OutputLine[];
  loop?: { line: OutputLine; intervalMs: number };
};

export type DemoAction = {
  name: string;
  label: string;
  cmd: string;
  display: "button" | "menu";
  type?: "terminal";
  confirm?: boolean;
  durationMs?: number;
  output: OutputLine[];
  loop?: { line: OutputLine; intervalMs: number };
};

export type DemoProfile = {
  name: string;
  services: string[];
};

export type DemoProject = {
  name: string;
  label?: string;
  root: string;
  stack: string;
  services: DemoService[];
  actions: DemoAction[];
  profiles: DemoProfile[];
};

function claudeCodeAction(cwd: string): DemoAction {
  return {
    name: "claude",
    label: "✻ Claude Code",
    cmd: "claude",
    display: "button",
    type: "terminal",
    output: [
      { text: "$ claude", color: "green", delay: 50 },
      { text: "", delay: 150 },
      { text: "  ✻ Welcome to Claude Code!", color: "magenta", delay: 300 },
      { text: "", delay: 340 },
      { text: "    /help for help · /status for your setup", color: "muted", delay: 420 },
      { text: `    cwd: ${cwd}`, color: "muted", delay: 500 },
      { text: "", delay: 540 },
      { text: "  ────────────────────", color: "muted", delay: 600 },
      { text: "", delay: 640 },
      { text: "  ※ Tip: lpm launched Claude in this project's root", color: "muted", delay: 780 },
      { text: "", delay: 820 },
    ],
  };
}

function codexAction(cwd: string): DemoAction {
  return {
    name: "codex",
    label: "◆ Codex",
    cmd: "codex",
    display: "button",
    type: "terminal",
    output: [
      { text: "$ codex", color: "green", delay: 50 },
      { text: "", delay: 150 },
      { text: "  ◆ Codex CLI · ready", color: "cyan", delay: 300 },
      { text: "", delay: 340 },
      { text: "    /help · /model · /resume", color: "muted", delay: 420 },
      { text: `    cwd: ${cwd}`, color: "muted", delay: 500 },
      { text: "", delay: 540 },
      { text: "  ────────────────────", color: "muted", delay: 600 },
      { text: "", delay: 640 },
      { text: "  ※ Tip: lpm launched Codex in this project's root", color: "muted", delay: 780 },
      { text: "", delay: 820 },
    ],
  };
}

const PROJECTS: DemoProject[] = [
  {
    name: "saas-app",
    label: "saas-app",
    root: "~/Projects/saas-app",
    stack: "Next.js + Rails + Sidekiq",
    services: [
      {
        name: "web",
        cmd: "pnpm dev",
        port: 3000,
        output: [
          { text: "$ pnpm dev", color: "green", delay: 50 },
          { text: "", delay: 150 },
          { text: "  ▲ Next.js 15.0.2", color: "muted", delay: 250 },
          { text: "  - Local:        http://localhost:3000", color: "muted", delay: 300 },
          { text: "  - Experiments:  turbo", color: "muted", delay: 320 },
          { text: "", delay: 340 },
          { text: " ✓ Ready in 842ms", color: "cyan", delay: 900 },
          { text: " ✓ Compiled /middleware in 124ms", color: "green", delay: 1400 },
          { text: " ○ Compiling /...", color: "muted", delay: 2100 },
          { text: " ✓ Compiled / in 412ms", color: "green", delay: 2800 },
          { text: "GET / 200 in 38ms", color: "muted", delay: 3400 },
          { text: "GET /dashboard 200 in 64ms", color: "muted", delay: 4200 },
        ],
        loop: {
          line: { text: "GET /api/session 200 in 11ms", color: "muted", delay: 0 },
          intervalMs: 3200,
        },
      },
      {
        name: "api",
        cmd: "bin/rails s -p 3001",
        port: 3001,
        output: [
          { text: "$ bin/rails s -p 3001", color: "green", delay: 50 },
          { text: "=> Booting Puma", color: "muted", delay: 400 },
          { text: "=> Rails 7.1.3 application starting in development", color: "muted", delay: 620 },
          { text: '=> Run `bin/rails server --help` for more startup options', color: "muted", delay: 700 },
          { text: "Puma starting in single mode...", color: "muted", delay: 900 },
          { text: "* Puma version: 6.4.0 (ruby 3.3.0-p0)", color: "muted", delay: 1000 },
          { text: "* Min threads: 5", color: "muted", delay: 1050 },
          { text: "* Max threads: 5", color: "muted", delay: 1100 },
          { text: "* Environment: development", color: "muted", delay: 1150 },
          { text: "* Listening on http://0.0.0.0:3001", color: "cyan", delay: 1400 },
          { text: "Use Ctrl-C to stop", color: "muted", delay: 1500 },
          { text: 'Started GET "/health" for ::1', color: "default", delay: 2600 },
          { text: "Completed 200 OK in 3ms (Views: 0.2ms | ActiveRecord: 0.1ms)", color: "muted", delay: 2700 },
        ],
        loop: {
          line: {
            text: 'Started GET "/api/v1/users" for ::1 | 200 OK in 12ms',
            color: "muted",
            delay: 0,
          },
          intervalMs: 4100,
        },
      },
      {
        name: "worker",
        cmd: "bundle exec sidekiq",
        output: [
          { text: "$ bundle exec sidekiq", color: "green", delay: 50 },
          { text: "             m,", color: "yellow", delay: 300 },
          { text: "           `$b", color: "yellow", delay: 330 },
          { text: '    .ss,  $$:         .,d$', color: "yellow", delay: 360 },
          { text: "    `$$P,d$P'    .,md$P\"'", color: "yellow", delay: 390 },
          { text: '     ,$$$$$P$P$$$P"', color: "yellow", delay: 420 },
          { text: '     d$$$$\"', color: "yellow", delay: 450 },
          { text: "    $$^^\"\"\"\"\"\"\"\"$$.", color: "yellow", delay: 480 },
          { text: "", delay: 510 },
          { text: "Sidekiq 7.2.0 • Redis localhost:6379", color: "muted", delay: 700 },
          { text: "Booting Sidekiq...", color: "muted", delay: 800 },
          { text: "Starting processing, hit Ctrl-C to stop", color: "cyan", delay: 1100 },
        ],
        loop: {
          line: {
            text: "MailerJob JID-8fe91 done: 48ms",
            color: "muted",
            delay: 0,
          },
          intervalMs: 5200,
        },
      },
    ],
    actions: [
      claudeCodeAction("~/Projects/saas-app"),
      {
        name: "test",
        label: "Run Tests",
        cmd: "pnpm test",
        display: "button",
        durationMs: 1200,
        output: [
          { text: "$ pnpm test", color: "green", delay: 50 },
          { text: "> vitest run", color: "muted", delay: 150 },
          { text: "", delay: 300 },
          { text: " ✓ src/lib/auth.test.ts (4)", color: "green", delay: 500 },
          { text: " ✓ src/lib/utils.test.ts (7)", color: "green", delay: 750 },
          { text: " ✓ src/components/button.test.tsx (3)", color: "green", delay: 950 },
          { text: "", delay: 1000 },
          { text: " Test Files  3 passed (3)", color: "default", delay: 1100 },
          { text: "      Tests  14 passed (14)", color: "default", delay: 1150 },
        ],
      },
      {
        name: "migrate",
        label: "Migrate",
        cmd: "bin/rails db:migrate",
        display: "button",
        confirm: true,
        durationMs: 900,
        output: [
          { text: "$ bin/rails db:migrate", color: "green", delay: 50 },
          { text: "== 20260423090100 AddIndexToUsers: migrating =======", color: "muted", delay: 200 },
          { text: "-- add_index(:users, :email, {:unique=>true})", color: "muted", delay: 400 },
          { text: "   -> 0.0182s", color: "muted", delay: 600 },
          { text: "== 20260423090100 AddIndexToUsers: migrated (0.0184s)", color: "green", delay: 850 },
        ],
      },
      {
        name: "deploy",
        label: "Deploy",
        cmd: "./scripts/deploy.sh production",
        display: "menu",
        confirm: true,
        durationMs: 1400,
        output: [
          { text: "$ ./scripts/deploy.sh production", color: "green", delay: 50 },
          { text: "→ building release bundle", color: "muted", delay: 250 },
          { text: "→ uploading to s3://releases/myapp", color: "muted", delay: 650 },
          { text: "→ rolling 3 instances", color: "muted", delay: 950 },
          { text: "✓ deployed v2026.4.23-rc1", color: "green", delay: 1300 },
        ],
      },
    ],
    profiles: [
      { name: "default", services: ["web", "api"] },
      { name: "full", services: ["web", "api", "worker"] },
      { name: "frontend", services: ["web"] },
    ],
  },
  {
    name: "auth-service",
    label: "auth-service",
    root: "~/Projects/auth-service",
    stack: "Go + Postgres + Redis",
    services: [
      {
        name: "server",
        cmd: "go run ./cmd/server",
        port: 8080,
        output: [
          { text: "$ go run ./cmd/server", color: "green", delay: 50 },
          { text: "2026/04/23 09:01:02 loading config from env", color: "muted", delay: 400 },
          { text: "2026/04/23 09:01:02 connected to postgres://localhost:5432/api", color: "muted", delay: 650 },
          { text: "2026/04/23 09:01:02 migrations: up to date (14)", color: "muted", delay: 700 },
          { text: "2026/04/23 09:01:02 server listening on :8080", color: "cyan", delay: 850 },
        ],
        loop: {
          line: {
            text: 'GET /healthz 200 0.4ms "kube-probe/1.29"',
            color: "muted",
            delay: 0,
          },
          intervalMs: 2500,
        },
      },
      {
        name: "postgres",
        cmd: "docker compose up postgres",
        port: 5432,
        output: [
          { text: "$ docker compose up postgres", color: "green", delay: 50 },
          { text: "[+] Running 1/1", color: "muted", delay: 400 },
          { text: " ✔ Container go-api-postgres-1  Created", color: "muted", delay: 550 },
          { text: "postgres  | PostgreSQL 16.1 starting up...", color: "muted", delay: 900 },
          { text: 'postgres  | database system is ready to accept connections', color: "cyan", delay: 1500 },
        ],
      },
      {
        name: "redis",
        cmd: "redis-server",
        port: 6379,
        output: [
          { text: "$ redis-server", color: "green", delay: 50 },
          { text: "37123:C 23 Apr 2026 09:01:03.001 * oO0OoO0OoO0Oo Redis is starting", color: "muted", delay: 400 },
          { text: "37123:M 23 Apr 2026 09:01:03.012 * Ready to accept connections tcp", color: "cyan", delay: 700 },
        ],
      },
    ],
    actions: [
      codexAction("~/Projects/auth-service"),
      {
        name: "test",
        label: "go test",
        cmd: "go test ./...",
        display: "button",
        durationMs: 1100,
        output: [
          { text: "$ go test ./...", color: "green", delay: 50 },
          { text: "ok   github.com/you/go-api/internal/auth   0.142s", color: "green", delay: 500 },
          { text: "ok   github.com/you/go-api/internal/db     0.281s", color: "green", delay: 800 },
          { text: "ok   github.com/you/go-api/internal/api    0.104s", color: "green", delay: 1050 },
        ],
      },
      {
        name: "build",
        label: "Build",
        cmd: "go build -o bin/server ./cmd/server",
        display: "button",
        durationMs: 700,
        output: [
          { text: "$ go build -o bin/server ./cmd/server", color: "green", delay: 50 },
          { text: "compiled: bin/server (18.2 MB)", color: "muted", delay: 680 },
        ],
      },
    ],
    profiles: [
      { name: "default", services: ["server", "postgres", "redis"] },
      { name: "deps", services: ["postgres", "redis"] },
    ],
  },
  {
    name: "docs-site",
    label: "docs-site",
    root: "~/Projects/docs-site",
    stack: "Astro + MDX",
    services: [
      {
        name: "site",
        cmd: "pnpm dev",
        port: 4321,
        output: [
          { text: "$ pnpm dev", color: "green", delay: 50 },
          { text: "", delay: 150 },
          { text: " 🚀  astro  v4.8.3 started in 612ms", color: "magenta", delay: 700 },
          { text: "", delay: 750 },
          { text: "  ┃ Local    http://localhost:4321/", color: "cyan", delay: 800 },
          { text: "  ┃ Network  use --host to expose", color: "muted", delay: 850 },
          { text: "", delay: 900 },
          { text: "09:01:15 watching for file changes...", color: "muted", delay: 1200 },
        ],
        loop: {
          line: {
            text: "09:01:18 [200] / 14ms",
            color: "muted",
            delay: 0,
          },
          intervalMs: 4800,
        },
      },
    ],
    actions: [
      claudeCodeAction("~/Projects/docs-site"),
      {
        name: "build",
        label: "Build",
        cmd: "pnpm build",
        display: "button",
        durationMs: 1600,
        output: [
          { text: "$ pnpm build", color: "green", delay: 50 },
          { text: " generating static routes ", color: "muted", delay: 400 },
          { text: "▶ src/pages/index.astro", color: "muted", delay: 700 },
          { text: "▶ src/pages/docs/[...slug].astro", color: "muted", delay: 1000 },
          { text: "  └─ 42 pages", color: "muted", delay: 1200 },
          { text: "✓ Complete!", color: "green", delay: 1500 },
        ],
      },
      {
        name: "deploy",
        label: "Deploy",
        cmd: "vercel deploy --prod",
        display: "button",
        confirm: true,
        durationMs: 1800,
        output: [
          { text: "$ vercel deploy --prod", color: "green", delay: 50 },
          { text: "Vercel CLI 38.0.0", color: "muted", delay: 200 },
          { text: "→ building project", color: "muted", delay: 500 },
          { text: "→ uploading build output (1.2 MB)", color: "muted", delay: 1000 },
          { text: "→ assigning production domain", color: "muted", delay: 1400 },
          { text: "✓ https://docs.example.com", color: "green", delay: 1700 },
        ],
      },
    ],
    profiles: [{ name: "default", services: ["site"] }],
  },
  {
    name: "ml-pipeline",
    label: "ml-pipeline",
    root: "~/Projects/ml-pipeline",
    stack: "Python + Jupyter",
    services: [
      {
        name: "notebook",
        cmd: "jupyter lab --no-browser",
        port: 8888,
        output: [
          { text: "$ jupyter lab --no-browser", color: "green", delay: 50 },
          { text: "[I 2026-04-23 09:01:02.000 ServerApp] jupyter_lsp | 2.2.5", color: "muted", delay: 400 },
          { text: "[I 2026-04-23 09:01:02.112 ServerApp] jupyterlab | 4.0.11", color: "muted", delay: 550 },
          { text: "[I 2026-04-23 09:01:02.214 ServerApp] Serving notebooks from: /Users/you/Projects/ml-pipeline", color: "muted", delay: 700 },
          { text: "[I 2026-04-23 09:01:02.320 ServerApp] Jupyter Server 2.12.1 is running at:", color: "muted", delay: 900 },
          { text: "[I 2026-04-23 09:01:02.321 ServerApp] http://localhost:8888/lab?token=9e2e…", color: "cyan", delay: 1000 },
        ],
      },
      {
        name: "trainer",
        cmd: "python -m pipeline.train",
        output: [
          { text: "$ python -m pipeline.train", color: "green", delay: 50 },
          { text: "loading dataset: ./data/train.parquet (128MB)", color: "muted", delay: 400 },
          { text: "epoch 1/10  loss=0.4821  acc=0.812", color: "default", delay: 1200 },
          { text: "epoch 2/10  loss=0.3114  acc=0.874", color: "default", delay: 2100 },
          { text: "epoch 3/10  loss=0.2247  acc=0.902", color: "default", delay: 3000 },
        ],
        loop: {
          line: {
            text: "epoch x/10  loss=0.18xx  acc=0.91x",
            color: "default",
            delay: 0,
          },
          intervalMs: 1800,
        },
      },
    ],
    actions: [
      codexAction("~/Projects/ml-pipeline"),
      {
        name: "train",
        label: "Train",
        cmd: "python -m pipeline.train --full",
        display: "button",
        confirm: true,
        durationMs: 2400,
        output: [
          { text: "$ python -m pipeline.train --full", color: "green", delay: 50 },
          { text: "loading dataset: ./data/train.parquet (512MB)", color: "muted", delay: 300 },
          { text: "gpu: NVIDIA A100 40GB · batch=64", color: "muted", delay: 600 },
          { text: "epoch 1/10  loss=0.4821  acc=0.812", color: "default", delay: 1000 },
          { text: "epoch 5/10  loss=0.1872  acc=0.908", color: "default", delay: 1600 },
          { text: "epoch 10/10 loss=0.0914  acc=0.942", color: "default", delay: 2100 },
          { text: "saved ./runs/20260423-091502.ckpt", color: "green", delay: 2300 },
        ],
      },
      {
        name: "eval",
        label: "Evaluate",
        cmd: "python -m pipeline.eval --latest",
        display: "button",
        durationMs: 1800,
        output: [
          { text: "$ python -m pipeline.eval --latest", color: "green", delay: 50 },
          { text: "loading checkpoint ./runs/latest.ckpt", color: "muted", delay: 300 },
          { text: "scoring test set (4096 samples)", color: "muted", delay: 900 },
          { text: "accuracy: 0.9241", color: "green", delay: 1500 },
          { text: "f1:       0.9103", color: "green", delay: 1650 },
        ],
      },
    ],
    profiles: [
      { name: "default", services: ["notebook"] },
      { name: "full", services: ["notebook", "trainer"] },
    ],
  },
];

export default PROJECTS;
