import type { AgentTask, SeedAction, SeedProject, SeedService } from "../types";
import { claudeAction, codexAction } from "./agents";
import type { ChangeSpec } from "./changes";
import { CALVER, DAY, HOUR, MINUTE, YMD } from "./clock";
import { defineProject } from "./define";
import { SAAS_APP_FILES } from "./saas-app-files";
import { DEPLOYS_PAGE, REVENUE_PAGE } from "./saas-pages";

// Mirrors the seeded working-tree diff, so the Review tab shows exactly the
// changes the visitor just watched Claude make.
const TASK_CLAUDE: AgentTask = {
  prompt: "Add a 14-day trial to the billing flow",
  steps: [
    { kind: "thinking" },
    { kind: "tool", label: "Read", arg: "src/lib/billing.ts", result: "28 lines" },
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
  keepBusy: true,
};

// Reads only: the working tree is the three files the Claude session already
// accounts for, so a finished edit here would be one the Review tab and
// `git status` both deny. This session is caught still sizing the migration up.
const TASK_CODEX: AgentTask = {
  prompt: "Move the plans table to integer cents",
  steps: [
    { kind: "tool", label: "Read", arg: "db/schema.rb", result: "25 lines" },
    { kind: "tool", label: "Bash", arg: 'rg -n "price_cents|price" app db', result: "17 matches" },
    {
      kind: "text",
      text: "Storing prices as floats rounds badly at the seam between Stripe and the ledger. Moving the column to integer cents needs a migration and a backfill — reading what the model does with it today first.",
    },
    { kind: "tool", label: "Read", arg: "app/models/plan.rb", result: "14 lines" },
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
  keepBusy: true,
};

const SERVICES: SeedService[] = [
  {
    name: "web",
    cmd: "pnpm dev",
    port: 3000,
    log: [
      { text: "$ pnpm dev", color: "green", at: 50 },
      { text: "", at: 150 },
      { text: "  ▲ Next.js 16.3.0", color: "muted", at: 250 },
      { text: "  - Local:        http://localhost:3000", color: "muted", at: 300 },
      { text: "  - Experiments:  turbo", color: "muted", at: 320 },
      { text: "", at: 340 },
      { text: " ✓ Ready in 842ms", color: "cyan", at: 900 },
      { text: " ✓ Compiled /middleware in 124ms", color: "green", at: 1400 },
      { text: " ○ Compiling /...", color: "muted", at: 2100 },
      { text: " ✓ Compiled / in 412ms", color: "green", at: 2800 },
      { text: "GET / 200 in 38ms", color: "muted", at: 3400 },
      { text: "GET /dashboard 200 in 64ms", color: "muted", at: 4200 },
    ],
    loop: { line: { text: "GET /api/session 200 in 11ms", color: "muted" }, everyMs: 3200 },
  },
  {
    name: "api",
    cmd: "bin/rails s -p 3001",
    port: 3001,
    log: [
      { text: "$ bin/rails s -p 3001", color: "green", at: 50 },
      { text: "=> Booting Puma", color: "muted", at: 400 },
      { text: "=> Rails 7.1.3 application starting in development", color: "muted", at: 620 },
      { text: "=> Run `bin/rails server --help` for more startup options", color: "muted", at: 700 },
      { text: "Puma starting in single mode...", color: "muted", at: 900 },
      { text: "* Puma version: 6.4.0 (ruby 3.3.0-p0)", color: "muted", at: 1000 },
      { text: "* Min threads: 5", color: "muted", at: 1050 },
      { text: "* Max threads: 5", color: "muted", at: 1100 },
      { text: "* Environment: development", color: "muted", at: 1150 },
      { text: "* Listening on http://0.0.0.0:3001", color: "cyan", at: 1400 },
      { text: "Use Ctrl-C to stop", color: "muted", at: 1500 },
      { text: 'Started GET "/health" for ::1', color: "default", at: 2600 },
      {
        text: "Completed 200 OK in 3ms (Views: 0.2ms | ActiveRecord: 0.1ms)",
        color: "muted",
        at: 2700,
      },
    ],
    loop: {
      line: { text: 'Started GET "/api/v1/users" for ::1 | 200 OK in 12ms', color: "muted" },
      everyMs: 4100,
    },
  },
  {
    name: "worker",
    cmd: "bundle exec sidekiq",
    log: [
      { text: "$ bundle exec sidekiq", color: "green", at: 50 },
      { text: "             m,", color: "yellow", at: 300 },
      { text: "           `$b", color: "yellow", at: 330 },
      { text: "    .ss,  $$:         .,d$", color: "yellow", at: 360 },
      { text: "    `$$P,d$P'    .,md$P\"'", color: "yellow", at: 390 },
      { text: '     ,$$$$$P$P$$$P"', color: "yellow", at: 420 },
      { text: '     d$$$$"', color: "yellow", at: 450 },
      { text: '    $$^^""""""""$$.', color: "yellow", at: 480 },
      { text: "", at: 510 },
      { text: "Sidekiq 7.2.0 • Redis localhost:6379", color: "muted", at: 700 },
      { text: "Booting Sidekiq...", color: "muted", at: 800 },
      { text: "Starting processing, hit Ctrl-C to stop", color: "cyan", at: 1100 },
    ],
    loop: { line: { text: "MailerJob JID-8fe91 done: 48ms", color: "muted" }, everyMs: 5200 },
  },
];

const ACTIONS: SeedAction[] = [
  claudeAction(TASK_CLAUDE),
  codexAction(TASK_CODEX),
  {
    name: "test",
    label: "Run Tests",
    emoji: "🧪",
    cmd: "pnpm test",
    display: "",
    type: "",
    durationMs: 1200,
    output: [
      { text: "$ pnpm test", color: "green", at: 50 },
      { text: "> vitest run", color: "muted", at: 150 },
      { text: "", at: 300 },
      { text: " ✓ src/lib/auth.test.ts (3)", color: "green", at: 500 },
      { text: " ✓ src/lib/utils.test.ts (3)", color: "green", at: 750 },
      { text: " ✓ src/components/button.test.tsx (3)", color: "green", at: 950 },
      { text: "", at: 1000 },
      { text: " Test Files  3 passed (3)", color: "default", at: 1100 },
      { text: "      Tests  9 passed (9)", color: "default", at: 1150 },
    ],
  },
  {
    name: "migrate",
    label: "Migrate",
    emoji: "🗄️",
    cmd: "bin/rails db:migrate",
    display: "",
    type: "",
    confirm: true,
    durationMs: 900,
    output: [
      { text: "$ bin/rails db:migrate", color: "green", at: 50 },
      { text: `== ${YMD}090100 AddIndexToUsers: migrating =======`, color: "muted", at: 200 },
      { text: "-- add_index(:users, :email, {:unique=>true})", color: "muted", at: 400 },
      { text: "   -> 0.0182s", color: "muted", at: 600 },
      { text: `== ${YMD}090100 AddIndexToUsers: migrated (0.0184s)`, color: "green", at: 850 },
    ],
  },
  {
    name: "deploys",
    label: "Deploys",
    emoji: "📈",
    cmd: "./scripts/deploy-log.sh",
    display: "",
    type: "",
    popup: { format: "html", title: "Deploys this week", width: 300, height: 196 },
    page: DEPLOYS_PAGE,
    durationMs: 600,
    output: [
      { text: "$ ./scripts/deploy-log.sh", color: "green", at: 50 },
      { text: "16 deploys this week, 1 failed (Fri, rolled back)", color: "default", at: 400 },
    ],
  },
  {
    name: "revenue",
    label: "Revenue",
    emoji: "💳",
    cmd: "",
    display: "",
    type: "app",
    app: { format: "html", title: "Revenue" },
    page: REVENUE_PAGE,
  },
  {
    name: "deploy",
    label: "Deploy",
    emoji: "🚢",
    cmd: "./scripts/deploy.sh production",
    display: "footer",
    type: "",
    confirm: true,
    durationMs: 1400,
    output: [
      { text: "$ ./scripts/deploy.sh production", color: "green", at: 50 },
      { text: "→ building release bundle", color: "muted", at: 250 },
      { text: "→ uploading to s3://releases/myapp", color: "muted", at: 650 },
      { text: "→ rolling 3 instances", color: "muted", at: 950 },
      { text: `✓ deployed ${CALVER}-rc1`, color: "green", at: 1300 },
    ],
  },
];

const CHANGES: ChangeSpec[] = [
  {
    path: "src/lib/billing.ts",
    status: "modified",
    diff: `@@ -14,6 +14,7 @@ export async function createSubscription(
   const customer = await stripe.customers.create({ email });
-  const price = PRICES[plan];
+  const price = PRICES[plan] ?? PRICES.starter;
   return stripe.subscriptions.create({
     customer: customer.id,
     items: [{ price }],
+    trial_period_days: 14,
   });`,
  },
  {
    path: "src/components/PlanCard.tsx",
    status: "modified",
    diff: `@@ -8,5 +8,6 @@ export function PlanCard({ plan }: Props) {
   return (
-    <div className="rounded-lg border p-4">
+    <div className="rounded-xl border p-5 shadow-sm">
+      {plan.popular && <Badge>Most popular</Badge>}
       <h3>{plan.name}</h3>
       <p className="text-2xl font-semibold">{plan.price}</p>
       <button className="mt-4 w-full rounded-md bg-black py-2 text-white">`,
  },
  { path: "src/lib/stripe-webhook.ts", status: "added" },
];

export const SAAS_APP: SeedProject = defineProject({
  name: "saas-app",
  root: "~/Projects/saas-app",
  services: SERVICES,
  actions: ACTIONS,
  profiles: [
    { name: "default", services: ["web", "api"] },
    { name: "full", services: ["web", "api", "worker"] },
    { name: "frontend", services: ["web"] },
  ],
  git: {
    branch: "feat/billing-flow",
    upstream: true,
    ahead: 2,
    behind: 0,
    branches: [
      { name: "feat/billing-flow", ageMs: 12 * MINUTE },
      { name: "main", ageMs: 2 * HOUR },
      { name: "feat/team-invites", ageMs: DAY },
      { name: "fix/login-redirect", ageMs: 3 * DAY },
      { name: "release-2026-04", remote: "origin", ageMs: 5 * HOUR },
      { name: "main", remote: "origin", ageMs: 2 * HOUR },
    ],
    pr: {
      number: 42,
      title: "Add a 14-day trial to the billing flow",
      url: "https://github.com/acme/saas-app/pull/42",
      base: "main",
      checks: [
        { name: "lint", workflow: "CI", state: "pass" },
        { name: "test", workflow: "CI", state: "pending" },
        { name: "build", workflow: "CI", state: "pending" },
      ],
      passAfterMs: 45_000,
    },
  },
  changes: CHANGES,
  tree: SAAS_APP_FILES,
  reply: {
    manifest: "package.json",
    readmeLines: "28 lines",
    manifestLines: "26 lines",
    sourceGlob: "src/**/*.ts",
    sourceMatches: "10 matches",
    overview:
      "Next.js frontend in `src/`, Rails API at the repo root (`app/`, `db/`, `bin/`), Sidekiq workers for async jobs.",
    flows: "Main flows: auth, billing, dashboard, teams. Want a deeper dive on any of them?",
    testCmd: "pnpm test",
    testResult: "9 passed in 2.1s",
    testSummary: "All 9 tests green. Auth, utils, and the button component all passed.",
    focusFile: "src/lib/billing.ts",
    focusLines: "29 lines",
    focusArea: "the billing module",
    hotspotDir: "src/lib/",
    deployFile: "scripts/deploy.sh",
    deployLines: "16 lines",
    deployCmd: "./scripts/deploy.sh production",
    draftFile: "src/lib/entitlements.ts",
    wireTarget: "the router",
  },
});
