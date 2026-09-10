import type { AgentStep, ReplyIntent } from "./agent-script";

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
  emoji?: string;
  cmd: string;
  display: "header" | "footer";
  type?: "terminal";
  agent?: "claude" | "codex";
  // When this agent action opens, the session starts with this prompt already
  // sent — "progress" streams an unfinished reply, "done" shows it complete.
  autoPrompt?: string;
  autoMode?: "progress" | "done" | "waiting";
  // The work that reply streams. Falls back to a generic canned session.
  autoSteps?: AgentStep[];
  // For a "waiting" session, what answering yes carries out.
  autoIntent?: ReplyIntent;
  autoAnswerSteps?: AgentStep[];
  confirm?: boolean;
  durationMs?: number;
  // Accent hex the button tints itself with, mirroring the app's `color:` field.
  // Left off for actions that should show the neutral fallback.
  color?: string;
  output: OutputLine[];
  loop?: { line: OutputLine; intervalMs: number };
};

export type DemoProfile = {
  name: string;
  services: string[];
};

export type DemoBranch = {
  name: string;
  remote?: string;
  age: string;
};

// What the agent knows about the project it was launched in, so a Go service
// doesn't get answers about a Next.js app.
export type ReplyContext = {
  manifest: string;
  manifestLines: string;
  sourceGlob: string;
  sourceMatches: string;
  overview: string;
  flows: string;
  testCmd: string;
  testResult: string;
  testSummary: string;
  focusFile: string;
  focusLines: string;
  focusArea: string;
  hotspotDir: string;
  deployFile: string;
  deployCmd: string;
  draftFile: string;
  wireTarget: string;
};

export type DiffLine = { t: "hunk" | "ctx" | "add" | "del"; text: string };

export type ChangedFile = {
  path: string;
  status: "modified" | "added" | "deleted";
  diff: DiffLine[];
};

export type DemoGit = {
  branch: string;
  upstream?: string;
  uncommitted: number;
  ahead: number;
  behind: number;
  branches: DemoBranch[];
};

export type DemoProject = {
  name: string;
  label?: string;
  root: string;
  stack: string;
  services: DemoService[];
  actions: DemoAction[];
  profiles: DemoProfile[];
  git?: DemoGit;
  // Action name to auto-open (mid-task) when this project is first viewed.
  autoStart?: string;
  // Working-tree diff behind the Review tab. Length tracks git.uncommitted.
  changedFiles?: ChangedFile[];
  replyContext?: ReplyContext;
};

export type AiStatus = "running" | "done" | "error" | "waiting";

// Seeded logs are stamped when the demo loads rather than written down, so a
// service's output never reads as months old. Only the demo chunk imports this
// module, and it is client-only, so there is no server render to disagree with.
const SEED_DAY = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const Y = SEED_DAY.getFullYear();
const M = pad(SEED_DAY.getMonth() + 1);
const D = pad(SEED_DAY.getDate());
const MONTH_ABBR = SEED_DAY.toLocaleString("en-US", { month: "short" });

/** 20260904 — the date half of a Rails migration version or a run id. */
const YMD = `${Y}${M}${D}`;
/** 2026/09/04 — Go's default log date. */
const SLASHED = `${Y}/${M}/${D}`;
/** 2026-09-04 — ISO, as Jupyter prints it. */
const DASHED = `${Y}-${M}-${D}`;
/** 4 Sep 2026 — how redis stamps its startup lines. */
const REDIS_DAY = `${SEED_DAY.getDate()} ${MONTH_ABBR} ${Y}`;
/** v2026.9.4 — a calendar-versioned release tag. */
const CALVER = `v${Y}.${SEED_DAY.getMonth() + 1}.${SEED_DAY.getDate()}`;
/** sep-04 — the date a nightly job's branch name carries. */
export const SEED_BRANCH_DAY = `${MONTH_ABBR.toLowerCase()}-${D}`;

// Boot banners are stamped a few seconds before the demo loaded rather than at a
// fixed 09:01, so a service the visitor starts reports a boot that just happened
// instead of one this morning — or, further east, one later today.
const clockAgo = (seconds: number) => {
  const t = new Date(SEED_DAY.getTime() - seconds * 1000);
  return `${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
};
// tsc stamps its watch lines with toLocaleTimeString, so on this machine —
// the same en-US one MONTH_ABBR is read off — they come out 12-hour.
const clock12Ago = (seconds: number) =>
  new Date(SEED_DAY.getTime() - seconds * 1000).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
const BOOT_T0 = clockAgo(3);
const BOOT_T1 = clockAgo(2);
const BOOT_T2 = clockAgo(1);
const WATCH_T0 = clock12Ago(3);
const WATCH_T1 = clock12Ago(1);
const runId = (clock: string) => `${YMD}-${clock.replace(/:/g, "")}`;

const CLAUDE_ACTION: DemoAction = {
  name: "claude",
  label: "Claude Code",
  emoji: "✻",
  cmd: "claude",
  display: "header",
  type: "terminal",
  agent: "claude",
  color: "#de8a68",
  output: [],
};

const CODEX_ACTION: DemoAction = {
  name: "codex",
  label: "Codex",
  emoji: "◆",
  cmd: "codex",
  display: "header",
  type: "terminal",
  agent: "codex",
  color: "#a78bfa",
  output: [],
};

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
          { text: "  ▲ Next.js 16.3.0", color: "muted", delay: 250 },
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
      {
        ...CLAUDE_ACTION,
        autoPrompt: "Add a 14-day trial to the billing flow",
        autoMode: "progress",
        // Mirrors saas-app's seeded working-tree diff, so the Review tab shows
        // exactly the changes the visitor just watched Claude make.
        autoSteps: [
          { kind: "thinking" },
          { kind: "tool", label: "Read", arg: "src/lib/billing.ts", result: "142 lines" },
          { kind: "tool", label: "Grep", arg: "createSubscription", result: "4 matches" },
          {
            kind: "text",
            text: "Adding the trial to subscription creation, with a fallback plan so an unknown price can't silently create a free subscription.",
          },
          { kind: "tool", label: "Edit", arg: "src/lib/billing.ts", result: "+2 -1" },
          { kind: "tool", label: "Edit", arg: "src/components/PlanCard.tsx", result: "+2 -1" },
          { kind: "tool", label: "Write", arg: "src/lib/stripe-webhook.ts", result: "+8" },
          { kind: "thinking" },
        ],
      },
      {
        ...CODEX_ACTION,
        autoPrompt: "Move the plans table to integer cents",
        autoMode: "progress",
        // Reads only: saas-app's working tree is the three files the Claude
        // session above already accounts for, so a finished edit here would be
        // one the Review tab and `git status` both deny. This session is caught
        // earlier, still sizing the migration up.
        autoSteps: [
          { kind: "tool", label: "Read", arg: "db/schema.rb", result: "212 lines" },
          {
            kind: "tool",
            label: "Bash",
            arg: 'rg -n "price_cents|price" app db',
            result: "17 matches",
          },
          {
            kind: "text",
            text: "Storing prices as floats rounds badly at the seam between Stripe and the ledger. Moving the column to integer cents needs a migration and a backfill — reading what the model does with it today first.",
          },
          { kind: "tool", label: "Read", arg: "app/models/plan.rb", result: "88 lines" },
          {
            kind: "tool",
            label: "Ran",
            arg: "bin/rails db:migrate:status",
            result: "1 migration pending",
          },
          {
            kind: "text",
            text: "Schema and backfill are clear. Before I touch the migration, checking what the Next.js side in `src/` does with the price today.",
          },
        ],
      },
      {
        name: "test",
        label: "Run Tests",
        emoji: "🧪",
        cmd: "pnpm test",
        display: "header",
        durationMs: 1200,
        color: "#4ade80",
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
        emoji: "🗄️",
        cmd: "bin/rails db:migrate",
        display: "header",
        confirm: true,
        durationMs: 900,
        color: "#60a5fa",
        output: [
          { text: "$ bin/rails db:migrate", color: "green", delay: 50 },
          { text: `== ${YMD}090100 AddIndexToUsers: migrating =======`, color: "muted", delay: 200 },
          { text: "-- add_index(:users, :email, {:unique=>true})", color: "muted", delay: 400 },
          { text: "   -> 0.0182s", color: "muted", delay: 600 },
          { text: `== ${YMD}090100 AddIndexToUsers: migrated (0.0184s)`, color: "green", delay: 850 },
        ],
      },
      {
        name: "deploy",
        label: "Deploy",
        emoji: "🚢",
        cmd: "./scripts/deploy.sh production",
        display: "footer",
        confirm: true,
        durationMs: 1400,
        color: "#fb923c",
        output: [
          { text: "$ ./scripts/deploy.sh production", color: "green", delay: 50 },
          { text: "→ building release bundle", color: "muted", delay: 250 },
          { text: "→ uploading to s3://releases/myapp", color: "muted", delay: 650 },
          { text: "→ rolling 3 instances", color: "muted", delay: 950 },
          { text: `✓ deployed ${CALVER}-rc1`, color: "green", delay: 1300 },
        ],
      },
    ],
    profiles: [
      { name: "default", services: ["web", "api"] },
      { name: "full", services: ["web", "api", "worker"] },
      { name: "frontend", services: ["web"] },
    ],
    replyContext: {
      manifest: "package.json",
      manifestLines: "42 lines",
      sourceGlob: "src/**/*.ts",
      sourceMatches: "86 matches",
      overview:
        "Next.js frontend in `src/`, Rails API at the repo root (`app/`, `db/`, `bin/`), Sidekiq workers for async jobs.",
      flows:
        "Main flows: auth, billing, dashboard, teams. Want a deeper dive on any of them?",
      testCmd: "pnpm test",
      testResult: "14 passed in 2.1s",
      testSummary:
        "All 14 tests green. Auth, utils, and the button component all passed.",
      focusFile: "src/lib/billing.ts",
      focusLines: "142 lines",
      focusArea: "the billing module",
      hotspotDir: "src/lib/",
      deployFile: "scripts/deploy.sh",
      deployCmd: "./scripts/deploy.sh production",
      draftFile: "src/lib/entitlements.ts",
      wireTarget: "the router",
    },
    changedFiles: [
      {
        path: "src/lib/billing.ts",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -14,5 +14,6 @@ export async function createSubscription(" },
          { t: "ctx", text: "   const customer = await stripe.customers.create({ email });" },
          { t: "del", text: "-  const price = PRICES[plan];" },
          { t: "add", text: "+  const price = PRICES[plan] ?? PRICES.starter;" },
          { t: "ctx", text: "   return stripe.subscriptions.create({" },
          { t: "ctx", text: "     customer: customer.id," },
          { t: "add", text: "+    trial_period_days: 14," },
          { t: "ctx", text: "   });" },
        ],
      },
      {
        path: "src/components/PlanCard.tsx",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -8,4 +8,5 @@ export function PlanCard({ plan }: Props) {" },
          { t: "ctx", text: "   return (" },
          { t: "del", text: '-    <div className="rounded-lg border p-4">' },
          { t: "add", text: '+    <div className="rounded-xl border p-5 shadow-sm">' },
          { t: "add", text: "+      {plan.popular && <Badge>Most popular</Badge>}" },
          { t: "ctx", text: "       <h3>{plan.name}</h3>" },
          { t: "ctx", text: "     </div>" },
        ],
      },
      {
        path: "src/lib/stripe-webhook.ts",
        status: "added",
        diff: [
          { t: "hunk", text: "@@ -0,0 +1,8 @@" },
          { t: "add", text: '+import { stripe } from "./billing";' },
          { t: "add", text: "+" },
          { t: "add", text: "+export async function handleWebhook(req: Request) {" },
          { t: "add", text: '+  const sig = req.headers.get("stripe-signature");' },
          { t: "add", text: "+  const event = stripe.webhooks.constructEvent(body, sig, secret);" },
          { t: "add", text: '+  if (event.type === "invoice.paid") await markPaid(event);' },
          { t: "add", text: "+  return new Response(null, { status: 200 });" },
          { t: "add", text: "+}" },
        ],
      },
    ],
    git: {
      branch: "feat/billing-flow",
      upstream: "origin",
      uncommitted: 3,
      ahead: 2,
      behind: 0,
      branches: [
        { name: "feat/billing-flow", age: "12m" },
        { name: "main", age: "2h" },
        { name: "feat/team-invites", age: "1d" },
        { name: "fix/login-redirect", age: "3d" },
        { name: "release-2026-04", remote: "origin", age: "5h" },
        { name: "main", remote: "origin", age: "2h" },
      ],
    },
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
          { text: `${SLASHED} ${BOOT_T0} loading config from env`, color: "muted", delay: 400 },
          { text: `${SLASHED} ${BOOT_T0} connected to postgres://localhost:5432/api`, color: "muted", delay: 650 },
          { text: `${SLASHED} ${BOOT_T1} migrations: up to date (14)`, color: "muted", delay: 700 },
          { text: `${SLASHED} ${BOOT_T1} server listening on :8080`, color: "cyan", delay: 850 },
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
          { text: " ✔ Container auth-service-postgres-1  Created", color: "muted", delay: 550 },
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
          { text: `37123:C ${REDIS_DAY} ${BOOT_T1}.001 * oO0OoO0OoO0Oo Redis is starting`, color: "muted", delay: 400 },
          { text: `37123:M ${REDIS_DAY} ${BOOT_T1}.012 * Ready to accept connections tcp`, color: "cyan", delay: 700 },
        ],
      },
    ],
    actions: [
      CLAUDE_ACTION,
      {
        name: "test",
        label: "go test",
        emoji: "🧪",
        cmd: "go test ./...",
        display: "header",
        durationMs: 1100,
        color: "#4ade80",
        output: [
          { text: "$ go test ./...", color: "green", delay: 50 },
          { text: "ok   github.com/you/auth-service/internal/auth   0.142s", color: "green", delay: 500 },
          { text: "ok   github.com/you/auth-service/internal/db     0.281s", color: "green", delay: 800 },
          { text: "ok   github.com/you/auth-service/internal/api    0.104s", color: "green", delay: 1050 },
        ],
      },
      {
        name: "build",
        label: "Build",
        emoji: "🔨",
        cmd: "go build -o bin/server ./cmd/server",
        display: "header",
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
    replyContext: {
      manifest: "go.mod",
      manifestLines: "28 lines",
      sourceGlob: "**/*.go",
      sourceMatches: "64 matches",
      overview:
        "Go HTTP service in `cmd/server`, JWT auth in `internal/auth`, Postgres access in `internal/db`, Redis for sessions.",
      flows:
        "Main flows: login, token refresh, key rotation, session revocation. Want a deeper dive on any of them?",
      testCmd: "go test ./...",
      testResult: "ok — 3 packages",
      testSummary:
        "All green across internal/auth, internal/db, and internal/api.",
      focusFile: "internal/auth/jwt.go",
      focusLines: "212 lines",
      focusArea: "internal/auth",
      hotspotDir: "internal/",
      deployFile: "k8s/auth-service.yaml",
      deployCmd: "kubectl rollout restart deploy/auth-service",
      draftFile: "internal/auth/handler.go",
      wireTarget: "the router",
    },
    changedFiles: [
      {
        path: "internal/auth/rotation.go",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -18,7 +18,14 @@ func (m *Manager) Rotate(ctx context.Context, now time.Time) error {" },
          { t: "ctx", text: " \tnext, err := newSigningKey()" },
          { t: "ctx", text: " \tif err != nil {" },
          { t: "ctx", text: ' \t\treturn fmt.Errorf("rotate signing key: %w", err)' },
          { t: "ctx", text: " \t}" },
          { t: "del", text: "-\tm.keys = []signingKey{next}" },
          { t: "add", text: "+\t// Give the outgoing key a deadline instead of dropping it, so tokens it" },
          { t: "add", text: "+\t// already signed keep verifying until they expire on their own." },
          { t: "add", text: "+\tfor i := range m.keys {" },
          { t: "add", text: "+\t\tif m.keys[i].RetireAfter.IsZero() {" },
          { t: "add", text: "+\t\t\tm.keys[i].RetireAfter = now.Add(m.graceWindow)" },
          { t: "add", text: "+\t\t}" },
          { t: "add", text: "+\t}" },
          { t: "add", text: "+\tm.keys = append([]signingKey{next}, m.unexpired(now)...)" },
          { t: "ctx", text: " \tm.activeKID = next.KID" },
          { t: "ctx", text: " \treturn m.store.Put(ctx, m.keys)" },
          { t: "hunk", text: "@@ -41,0 +48,10 @@" },
          { t: "add", text: "+// unexpired keeps the keys still inside their grace window." },
          { t: "add", text: "+func (m *Manager) unexpired(now time.Time) []signingKey {" },
          { t: "add", text: "+\tkept := make([]signingKey, 0, len(m.keys))" },
          { t: "add", text: "+\tfor _, k := range m.keys {" },
          { t: "add", text: "+\t\tif now.Before(k.RetireAfter) {" },
          { t: "add", text: "+\t\t\tkept = append(kept, k)" },
          { t: "add", text: "+\t\t}" },
          { t: "add", text: "+\t}" },
          { t: "add", text: "+\treturn kept" },
          { t: "add", text: "+}" },
        ],
      },
      {
        path: "internal/auth/jwt.go",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -96,6 +96,11 @@ func Parse(raw string, keys *KeySet) (*Claims, error) {" },
          { t: "ctx", text: " \ttok, err := jwt.ParseWithClaims(raw, &Claims{}, func(t *jwt.Token) (any, error) {" },
          { t: "del", text: "-\t\treturn keys.Active().Public(), nil" },
          { t: "add", text: '+\t\tkid, _ := t.Header["kid"].(string)' },
          { t: "add", text: "+\t\tkey, ok := keys.ByID(kid)" },
          { t: "add", text: "+\t\tif !ok {" },
          { t: "add", text: "+\t\t\treturn nil, ErrUnknownKeyID" },
          { t: "add", text: "+\t\t}" },
          { t: "add", text: "+\t\treturn key.Public(), nil" },
          { t: "ctx", text: " \t})" },
          { t: "ctx", text: " \tif err != nil {" },
          { t: "ctx", text: " \t\treturn nil, ErrInvalidToken" },
          { t: "ctx", text: " \t}" },
        ],
      },
    ],
    git: {
      branch: "main",
      upstream: "origin",
      uncommitted: 2,
      ahead: 0,
      behind: 1,
      branches: [
        { name: "main", age: "1h" },
        { name: "refactor/jwt-rotation", age: "4h" },
        { name: "fix/token-leak", age: "2d" },
        { name: "main", remote: "origin", age: "20m" },
        { name: "staging", remote: "origin", age: "1d" },
      ],
    },
  },
  {
    name: "docs-site",
    label: "docs-site",
    root: "~/Projects/docs-site",
    stack: "Astro + MDX",
    autoStart: "claude",
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
          { text: `${BOOT_T1} watching for file changes...`, color: "muted", delay: 1200 },
        ],
        loop: {
          line: {
            text: `${BOOT_T2} [200] / 14ms`,
            color: "muted",
            delay: 0,
          },
          intervalMs: 4800,
        },
      },
    ],
    actions: [
      {
        ...CLAUDE_ACTION,
        autoPrompt: "Regenerate the API reference docs from the current routes",
        autoMode: "done",
      },
      {
        name: "build",
        label: "Build",
        emoji: "🔨",
        cmd: "pnpm build",
        display: "header",
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
        emoji: "🚢",
        cmd: "vercel deploy --prod",
        display: "footer",
        confirm: true,
        durationMs: 1800,
        color: "#fb923c",
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
    replyContext: {
      manifest: "package.json",
      manifestLines: "31 lines",
      sourceGlob: "src/content/**/*.mdx",
      sourceMatches: "42 matches",
      overview:
        "Astro site with MDX content in `src/content/docs`, custom components in `src/components`.",
      flows:
        "Sections: quickstart, API reference, guides, changelog. Want a deeper dive on any of them?",
      testCmd: "pnpm build",
      testResult: "42 pages in 1.6s",
      testSummary: "Build clean — all 42 pages generated, no broken links.",
      focusFile: "src/content/docs/api/authentication.mdx",
      focusLines: "96 lines",
      focusArea: "the API reference",
      hotspotDir: "src/components/",
      deployFile: "vercel.json",
      deployCmd: "vercel deploy --prod",
      draftFile: "src/content/docs/guides/new-guide.mdx",
      wireTarget: "the sidebar nav",
    },
    changedFiles: [
      {
        path: "src/content/docs/api/authentication.mdx",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -1,5 +1,9 @@" },
          { t: "ctx", text: " ---" },
          { t: "del", text: "-title: API Keys" },
          { t: "add", text: "+title: Authentication" },
          { t: "ctx", text: " ---" },
          { t: "ctx", text: "" },
          { t: "del", text: "-Pass your key as a query parameter." },
          { t: "add", text: "+Send your key in the `Authorization` header:" },
          { t: "add", text: "+" },
          { t: "add", text: "+```bash" },
          { t: "add", text: '+curl -H "Authorization: Bearer $API_KEY" https://api.example.com/v2/me' },
          { t: "add", text: "+```" },
        ],
      },
      {
        path: "src/content/docs/api/webhooks.mdx",
        status: "added",
        diff: [
          { t: "hunk", text: "@@ -0,0 +1,8 @@" },
          { t: "add", text: "+---" },
          { t: "add", text: "+title: Webhooks" },
          { t: "add", text: "+---" },
          { t: "add", text: "+" },
          { t: "add", text: "+Every webhook is signed with `X-Signature`. Verify it before" },
          { t: "add", text: "+trusting the payload." },
          { t: "add", text: "+" },
          { t: "add", text: "+<ApiEndpoint method=\"POST\" path=\"/v2/webhooks\" />" },
        ],
      },
      {
        path: "src/components/ApiEndpoint.astro",
        status: "added",
        diff: [
          { t: "hunk", text: "@@ -0,0 +1,8 @@" },
          { t: "add", text: "+---" },
          { t: "add", text: "+const { method, path } = Astro.props;" },
          { t: "add", text: "+---" },
          { t: "add", text: "+" },
          { t: "add", text: '+<div class="endpoint">' },
          { t: "add", text: "+  <span class={`method method--${method.toLowerCase()}`}>{method}</span>" },
          { t: "add", text: "+  <code>{path}</code>" },
          { t: "add", text: "+</div>" },
        ],
      },
      {
        path: "src/content/docs/index.mdx",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -12,2 +12,3 @@ Start here if you're new." },
          { t: "ctx", text: " - [Quickstart](/docs/quickstart)" },
          { t: "ctx", text: " - [Authentication](/docs/api/authentication)" },
          { t: "add", text: "+- [Webhooks](/docs/api/webhooks)" },
        ],
      },
      {
        path: "astro.config.mjs",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -6,4 +6,5 @@ export default defineConfig({" },
          { t: "ctx", text: "   integrations: [" },
          { t: "ctx", text: "     mdx()," },
          { t: "add", text: "+    sitemap()," },
          { t: "ctx", text: "   ]," },
          { t: "ctx", text: " });" },
        ],
      },
    ],
    git: {
      branch: "docs/api-v2",
      upstream: "origin",
      uncommitted: 5,
      ahead: 1,
      behind: 0,
      branches: [
        { name: "docs/api-v2", age: "32m" },
        { name: "main", age: "1d" },
        { name: "fix/typos", age: "3d" },
        { name: "main", remote: "origin", age: "1d" },
      ],
    },
  },
  {
    name: "ml-pipeline",
    label: "ml-pipeline",
    root: "~/Projects/ml-pipeline",
    stack: "Python + Jupyter",
    autoStart: "codex",
    services: [
      {
        name: "notebook",
        cmd: "jupyter lab --no-browser",
        port: 8888,
        output: [
          { text: "$ jupyter lab --no-browser", color: "green", delay: 50 },
          { text: `[I ${DASHED} ${BOOT_T0}.000 ServerApp] jupyter_lsp | 2.2.5`, color: "muted", delay: 400 },
          { text: `[I ${DASHED} ${BOOT_T0}.112 ServerApp] jupyterlab | 4.0.11`, color: "muted", delay: 550 },
          { text: `[I ${DASHED} ${BOOT_T0}.214 ServerApp] Serving notebooks from: /Users/you/Projects/ml-pipeline`, color: "muted", delay: 700 },
          { text: `[I ${DASHED} ${BOOT_T1}.320 ServerApp] Jupyter Server 2.12.1 is running at:`, color: "muted", delay: 900 },
          { text: `[I ${DASHED} ${BOOT_T1}.321 ServerApp] http://localhost:8888/lab?token=9e2e…`, color: "cyan", delay: 1000 },
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
          { text: "epoch 4/10  loss=0.1968  acc=0.911", color: "default", delay: 3900 },
          { text: "epoch 5/10  loss=0.1743  acc=0.918", color: "default", delay: 4800 },
          { text: "epoch 6/10  loss=0.1522  acc=0.924", color: "default", delay: 5700 },
          { text: "epoch 7/10  loss=0.1361  acc=0.929", color: "default", delay: 6600 },
          { text: "epoch 8/10  loss=0.1204  acc=0.933", color: "default", delay: 7500 },
          { text: "epoch 9/10  loss=0.1078  acc=0.937", color: "default", delay: 8400 },
          { text: "epoch 10/10 loss=0.0982  acc=0.939", color: "default", delay: 9300 },
          { text: `saved ./runs/${runId(BOOT_T0)}.ckpt`, color: "green", delay: 9900 },
        ],
      },
    ],
    actions: [
      {
        ...CODEX_ACTION,
        autoPrompt: "Fix the train/test leak in the feature scaler",
        autoMode: "waiting",
        autoIntent: "fix",
        // The question is about work the visitor can already see: the two files
        // in the Review tab are the fix, sitting uncommitted. Asking to *make*
        // the change would be asking permission for a diff that is already on
        // disk, so it asks to score it instead.
        autoSteps: [
          { kind: "tool", label: "Read", arg: "pipeline/features.py", result: "184 lines" },
          {
            kind: "tool",
            label: "Bash",
            arg: 'rg -n "amount_norm|scaler" pipeline',
            result: "6 matches",
          },
          {
            kind: "text",
            text: "`amount_norm` was divided by `df[\"amount\"].max()` across the whole frame, so the test split set the scale training saw. It's a RobustScaler fit on the train split alone now, with the val metric logged in `pipeline/train.py` — both files are uncommitted in the working tree.",
          },
          {
            kind: "text",
            text: "Closing the leak will move your eval numbers. Refit and score it so you see the honest ones before this is committed?",
          },
        ],
        autoAnswerSteps: [
          { kind: "thinking" },
          { kind: "tool", label: "Bash", arg: "pytest -q", result: "23 passed in 4.8s" },
          {
            kind: "tool",
            label: "Bash",
            arg: "python -m pipeline.eval --refit",
            result: "accuracy 0.904",
          },
          {
            kind: "text",
            text: "0.924 → 0.904 once the scaler only ever sees the train split. That drop is the leak coming out, not a regression — the old number was scored against statistics the model had already been given. Tests are green and both files are still uncommitted, so the diff is yours to review.",
          },
          { kind: "text", text: "Ready for the next one.", style: "muted" },
        ],
      },
      {
        name: "train",
        label: "Train",
        emoji: "🏋️",
        cmd: "python -m pipeline.train --full",
        display: "header",
        confirm: true,
        durationMs: 2400,
        color: "#fbbf24",
        output: [
          { text: "$ python -m pipeline.train --full", color: "green", delay: 50 },
          { text: "loading dataset: ./data/train.parquet (128MB)", color: "muted", delay: 300 },
          { text: "gpu: NVIDIA A100 40GB · batch=64", color: "muted", delay: 600 },
          { text: "epoch 1/10  loss=0.4821  acc=0.812", color: "default", delay: 1000 },
          { text: "epoch 5/10  loss=0.1872  acc=0.908", color: "default", delay: 1600 },
          { text: "epoch 10/10 loss=0.0914  acc=0.942", color: "default", delay: 2100 },
          { text: `saved ./runs/${runId(BOOT_T2)}.ckpt`, color: "green", delay: 2300 },
        ],
      },
      {
        name: "eval",
        label: "Evaluate",
        emoji: "📊",
        cmd: "python -m pipeline.eval --latest",
        display: "header",
        durationMs: 1800,
        color: "#22d3ee",
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
    replyContext: {
      manifest: "pyproject.toml",
      manifestLines: "38 lines",
      sourceGlob: "pipeline/**/*.py",
      sourceMatches: "51 matches",
      overview:
        "Python training pipeline in `pipeline/`, exploratory notebooks in `notebooks/`, checkpoints under `runs/`.",
      flows:
        "Main stages: ingest, features, train, eval. Want a deeper dive on any of them?",
      testCmd: "pytest -q",
      testResult: "23 passed in 4.8s",
      testSummary:
        "All 23 tests green across features, training, and eval.",
      focusFile: "pipeline/features.py",
      focusLines: "184 lines",
      focusArea: "the feature builder",
      hotspotDir: "pipeline/",
      deployFile: "Makefile",
      deployCmd: "make train-full",
      draftFile: "pipeline/transforms.py",
      wireTarget: "the pipeline config",
    },
    changedFiles: [
      {
        path: "pipeline/features.py",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -28,4 +28,6 @@ def build_features(df: pd.DataFrame) -> pd.DataFrame:" },
          { t: "ctx", text: "     df = df.dropna(subset=[\"user_id\"])" },
          { t: "del", text: "-    df[\"amount_norm\"] = df[\"amount\"] / df[\"amount\"].max()" },
          { t: "add", text: "+    # max() leaks the test set into training — scale on the train split only" },
          { t: "add", text: "+    scaler = RobustScaler().fit(df.loc[df.split == \"train\", [\"amount\"]])" },
          { t: "add", text: "+    df[\"amount_norm\"] = scaler.transform(df[[\"amount\"]])" },
          { t: "ctx", text: "     df[\"is_weekend\"] = df[\"ts\"].dt.dayofweek >= 5" },
          { t: "ctx", text: "     return df" },
        ],
      },
      {
        path: "pipeline/train.py",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -41,4 +41,6 @@ def train(cfg: Config) -> Path:" },
          { t: "ctx", text: "     model = GradientBoosting(**cfg.params)" },
          { t: "ctx", text: "     model.fit(X_train, y_train)" },
          { t: "add", text: "+    mlflow.log_metric(\"val_f1\", f1_score(y_val, model.predict(X_val)))" },
          { t: "add", text: "+    mlflow.log_params(cfg.params)" },
          { t: "ctx", text: "     ckpt = RUNS / f\"{run_id}.ckpt\"" },
          { t: "ctx", text: "     joblib.dump(model, ckpt)" },
        ],
      },
    ],
    git: {
      branch: "exp/data-pipeline-v3",
      upstream: "origin",
      uncommitted: 2,
      ahead: 4,
      behind: 2,
      branches: [
        { name: "exp/data-pipeline-v3", age: "1h" },
        { name: "main", age: "3d" },
        { name: "exp/embeddings", age: "2d" },
        { name: "fix/oom", age: "5d" },
        { name: "main", remote: "origin", age: "12h" },
      ],
    },
  },
  {
    name: "mobile-app",
    label: "mobile-app",
    root: "~/Projects/mobile-app",
    stack: "Expo + React Native",
    services: [
      {
        // No port: Metro hands a device an exp:// URL rather than serving a
        // page, so there is nothing here for the browser pane to open.
        name: "metro",
        cmd: "npx expo start --ios",
        output: [
          { text: "$ npx expo start --ios", color: "green", delay: 50 },
          { text: "Starting project at /Users/you/Projects/mobile-app", color: "muted", delay: 400 },
          { text: "Starting Metro Bundler", color: "muted", delay: 650 },
          { text: "› Metro waiting on exp://192.168.1.24:8081", color: "cyan", delay: 950 },
          { text: "› Using development build", color: "muted", delay: 1000 },
          { text: "", delay: 1050 },
          { text: "› Press a │ open Android", color: "muted", delay: 1100 },
          { text: "› Press i │ open iOS simulator", color: "muted", delay: 1150 },
          { text: "› Press r │ reload app", color: "muted", delay: 1200 },
          { text: "› Press ? │ show all commands", color: "muted", delay: 1250 },
          { text: "", delay: 1300 },
          { text: "› Opening on iPhone 17 Pro", color: "muted", delay: 1900 },
          { text: "iOS Bundled 3184ms index.ts (1128 modules)", color: "green", delay: 3400 },
        ],
        loop: {
          line: {
            text: " LOG  [api] GET /v1/plans 200 in 96ms",
            color: "muted",
            delay: 0,
          },
          intervalMs: 5200,
        },
      },
      {
        name: "types",
        cmd: "npx tsc --noEmit --watch",
        output: [
          { text: "$ npx tsc --noEmit --watch", color: "green", delay: 50 },
          { text: `[${WATCH_T0}] Starting compilation in watch mode...`, color: "muted", delay: 500 },
          { text: "", delay: 550 },
          { text: `[${WATCH_T1}] Found 0 errors. Watching for file changes.`, color: "cyan", delay: 1600 },
        ],
      },
    ],
    actions: [
      { ...CLAUDE_ACTION },
      { ...CODEX_ACTION },
      {
        name: "test",
        label: "Tests",
        emoji: "🧪",
        cmd: "pnpm test",
        display: "header",
        durationMs: 1500,
        color: "#4ade80",
        output: [
          { text: "$ pnpm test", color: "green", delay: 50 },
          { text: "> jest", color: "muted", delay: 150 },
          { text: "", delay: 250 },
          { text: " PASS  src/lib/session.test.ts", color: "green", delay: 700 },
          { text: " PASS  src/screens/PlansScreen.test.tsx", color: "green", delay: 1050 },
          { text: "", delay: 1100 },
          { text: "Test Suites: 2 passed, 2 total", color: "default", delay: 1200 },
          { text: "Tests:       11 passed, 11 total", color: "default", delay: 1250 },
          { text: "Snapshots:   0 total", color: "default", delay: 1300 },
          { text: "Time:        2.31 s", color: "muted", delay: 1350 },
          { text: "Ran all test suites.", color: "muted", delay: 1450 },
        ],
      },
      {
        name: "ios",
        label: "Run iOS",
        emoji: "📱",
        cmd: "npx expo run:ios",
        display: "header",
        durationMs: 2600,
        color: "#60a5fa",
        output: [
          { text: "$ npx expo run:ios", color: "green", delay: 50 },
          { text: "› Planning build", color: "muted", delay: 350 },
          { text: "› Executing xcodebuild -workspace ios/mobileapp.xcworkspace -scheme mobileapp", color: "muted", delay: 700 },
          { text: "› Build Succeeded", color: "green", delay: 2000 },
          { text: "› Installing on iPhone 17 Pro", color: "muted", delay: 2280 },
          { text: "› Opening on iPhone 17 Pro (com.example.mobileapp)", color: "cyan", delay: 2500 },
        ],
      },
      {
        name: "update",
        label: "Publish update",
        emoji: "🚢",
        cmd: "eas update --branch preview",
        display: "footer",
        confirm: true,
        durationMs: 1900,
        color: "#fb923c",
        output: [
          { text: "$ eas update --branch preview", color: "green", delay: 50 },
          { text: "✔ Compressed bundle files", color: "muted", delay: 500 },
          { text: "✔ Uploaded 2 app bundles", color: "muted", delay: 1000 },
          { text: "✔ Published!", color: "green", delay: 1500 },
          { text: "  Branch          preview", color: "muted", delay: 1600 },
          { text: "  Runtime version 1.4.0", color: "muted", delay: 1680 },
          { text: "  Platform        ios, android", color: "muted", delay: 1760 },
          { text: "  Update group    8c1e2f4a…", color: "muted", delay: 1840 },
        ],
      },
    ],
    profiles: [
      { name: "default", services: ["metro"] },
      { name: "full", services: ["metro", "types"] },
    ],
    replyContext: {
      manifest: "package.json",
      manifestLines: "36 lines",
      sourceGlob: "src/**/*.tsx",
      sourceMatches: "38 matches",
      overview:
        "Expo app for iOS and Android — screens in `src/screens`, the API client in `src/lib/api.ts`, native projects in `ios/` and `android/`. It reads the same `/v1` API saas-app serves.",
      flows:
        "Main flows: sign-in, plans, usage, push notifications. Want a deeper dive on any of them?",
      testCmd: "pnpm test",
      testResult: "11 passed in 2.3s",
      testSummary:
        "All 11 tests green across the session store and the plans screen.",
      focusFile: "src/lib/api.ts",
      focusLines: "118 lines",
      focusArea: "the API client",
      hotspotDir: "src/screens/",
      deployFile: "eas.json",
      deployCmd: "eas update --branch preview",
      draftFile: "src/lib/offline-queue.ts",
      wireTarget: "the API client",
    },
    // Left half-finished: the trial banner needs a field the API does not
    // return yet, which is the work saas-app is busy adding.
    changedFiles: [
      {
        path: "src/lib/api.ts",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -22,6 +22,8 @@ export type Plan = {" },
          { t: "ctx", text: "   id: string;" },
          { t: "ctx", text: "   name: string;" },
          { t: "ctx", text: "   priceCents: number;" },
          { t: "add", text: "+  /** Days of free trial the API grants, or null when the plan has none. */" },
          { t: "add", text: "+  trialDays: number | null;" },
          { t: "ctx", text: " };" },
          { t: "ctx", text: "" },
          { t: "ctx", text: " export async function fetchPlans(): Promise<Plan[]> {" },
          { t: "hunk", text: "@@ -38,6 +40,7 @@ function toPlan(row: PlanRow): Plan {" },
          { t: "ctx", text: "     id: row.id," },
          { t: "ctx", text: "     name: row.name," },
          { t: "ctx", text: "     priceCents: Math.round(row.price * 100)," },
          { t: "add", text: "+    trialDays: row.trial_period_days ?? null," },
          { t: "ctx", text: "   };" },
          { t: "ctx", text: " }" },
          { t: "ctx", text: "" },
        ],
      },
      {
        path: "src/screens/PlansScreen.tsx",
        status: "modified",
        diff: [
          { t: "hunk", text: "@@ -46,8 +46,13 @@ function PlanRow({ plan }: { plan: Plan }) {" },
          { t: "ctx", text: "     <View style={styles.card}>" },
          { t: "ctx", text: "       <Text style={styles.planName}>{plan.name}</Text>" },
          { t: "ctx", text: "       <Text style={styles.price}>{formatPrice(plan.priceCents)}</Text>" },
          { t: "add", text: "+      {plan.trialDays ? (" },
          { t: "add", text: "+        <Text style={styles.trial}>{plan.trialDays} days free</Text>" },
          { t: "add", text: "+      ) : null}" },
          { t: "ctx", text: "       <Pressable style={styles.cta} onPress={() => subscribe(plan.id)}>" },
          { t: "del", text: "-        <Text style={styles.ctaLabel}>Choose plan</Text>" },
          { t: "add", text: "+        <Text style={styles.ctaLabel}>" },
          { t: "add", text: '+          {plan.trialDays ? "Start free trial" : "Choose plan"}' },
          { t: "add", text: "+        </Text>" },
          { t: "ctx", text: "       </Pressable>" },
          { t: "ctx", text: "     </View>" },
          { t: "ctx", text: "   );" },
          { t: "hunk", text: "@@ -79,6 +84,11 @@ const styles = StyleSheet.create({" },
          { t: "ctx", text: "     fontSize: 28," },
          { t: "ctx", text: '     fontWeight: "600",' },
          { t: "ctx", text: "   }," },
          { t: "add", text: "+  trial: {" },
          { t: "add", text: "+    marginTop: 4," },
          { t: "add", text: "+    fontSize: 13," },
          { t: "add", text: '+    color: "#16a34a",' },
          { t: "add", text: "+  }," },
          { t: "ctx", text: "   cta: {" },
          { t: "ctx", text: "     marginTop: 16," },
          { t: "ctx", text: "     borderRadius: 12," },
        ],
      },
    ],
    git: {
      branch: "main",
      upstream: "origin",
      uncommitted: 2,
      ahead: 0,
      behind: 3,
      branches: [
        { name: "main", age: "5d" },
        { name: "feat/push-notifications", age: "6d" },
        { name: "chore/sdk-upgrade", age: "3w" },
        { name: "main", remote: "origin", age: "6h" },
        { name: "release/ios-1.4", remote: "origin", age: "2d" },
      ],
    },
  },
];

// Seeded so the sidebar shows lpm's per-project AI states at a glance: one
// agent that just finished (done) and one stopped on a question (waiting →
// "Needs you"). The selected project picks up live status when you launch
// Claude Code or Codex in it.
export const INITIAL_AI_STATUS: Record<string, AiStatus> = {
  "docs-site": "done",
  "ml-pipeline": "waiting",
};

export default PROJECTS;
