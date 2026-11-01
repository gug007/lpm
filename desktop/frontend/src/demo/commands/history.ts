import type { CommandMap } from "../backend";
import { projectAt, type Project } from "./state";

const CLAUDE = "Claude Opus 5.5 <noreply@anthropic.com>";
const CODEX = "Codex <codex@openai.com>";
const HOUR = 3600;

interface SampleFile {
  path: string;
  status: "A" | "M" | "D";
  before: string[];
  after: string[];
}

const STATUS_LABEL = { A: "added", M: "modified", D: "deleted" } as const;

interface SampleCommit {
  subject: string;
  body?: string;
  author: string;
  coAuthor?: string;
  hoursAgo: number;
  // Indexes into SAMPLES, first parent first; the next sample when unset.
  parents?: number[];
  tag?: string;
  files: SampleFile[];
}

const SAMPLES: SampleCommit[] = [
  {
    subject: "Add billing_plans migration",
    body: "Plans get their own table so prices can change without a deploy.",
    author: "Dana Reyes",
    coAuthor: CLAUDE,
    hoursAgo: 2,
    files: [
      { path: "db/migrate/20261028_create_billing_plans.rb", status: "A", before: [], after: ["class CreateBillingPlans < ActiveRecord::Migration[7.2]", "  def change", "    create_table :billing_plans do |t|", "      t.string :name, null: false", "      t.integer :price_cents, null: false", "      t.timestamps", "    end", "  end", "end"] },
      { path: "db/schema.rb", status: "M", before: ["ActiveRecord::Schema[7.2].define(version: 2026_10_21) do", "  create_table \"accounts\" do |t|"], after: ["ActiveRecord::Schema[7.2].define(version: 2026_10_28) do", "  create_table \"billing_plans\" do |t|", "    t.string \"name\", null: false", "    t.integer \"price_cents\", null: false", "  end", "", "  create_table \"accounts\" do |t|"] },
    ],
  },
  {
    subject: "Wire the Stripe webhook handler",
    author: "Dana Reyes",
    coAuthor: CLAUDE,
    hoursAgo: 3,
    files: [
      { path: "app/webhooks/stripe.ts", status: "M", before: ["export async function handle(event: Stripe.Event) {", "  return null;", "}"], after: ["export async function handle(event: Stripe.Event) {", "  if (event.type === \"invoice.paid\") {", "    await markPaid(event.data.object.id);", "  }", "  return null;", "}"] },
    ],
  },
  {
    subject: "Add the plan picker UI",
    author: "Sam Okafor",
    hoursAgo: 26,
    files: [
      { path: "src/billing/PlanPicker.tsx", status: "A", before: [], after: ["export function PlanPicker({ plans }: { plans: Plan[] }) {", "  return <ul>{plans.map((p) => <li key={p.id}>{p.name}</li>)}</ul>;", "}"] },
      { path: "src/billing/index.ts", status: "M", before: ["export * from \"./usage\";"], after: ["export * from \"./usage\";", "export * from \"./PlanPicker\";"] },
    ],
  },
  {
    subject: "Merge pull request #142 from priya/fix-login-redirect",
    author: "Sam Okafor",
    hoursAgo: 50,
    parents: [5, 4],
    files: [
      { path: "src/auth/redirect.ts", status: "M", before: ["  return \"/\";"], after: ["  return next && next.startsWith(\"/\") ? next : \"/\";"] },
    ],
  },
  {
    subject: "Keep the login redirect on this site",
    author: "Priya Nair",
    coAuthor: CODEX,
    hoursAgo: 52,
    parents: [5],
    files: [
      { path: "src/auth/redirect.ts", status: "M", before: ["  return \"/\";"], after: ["  return next && next.startsWith(\"/\") ? next : \"/\";"] },
      { path: "src/auth/redirect.test.ts", status: "A", before: [], after: ["it(\"refuses another site\", () => {", "  expect(redirectTo(\"https://evil.dev\")).toBe(\"/\");", "});"] },
    ],
  },
  {
    subject: "Bump next to 16.3.0",
    author: "Priya Nair",
    hoursAgo: 75,
    files: [
      { path: "package.json", status: "M", before: ["    \"next\": \"16.2.4\","], after: ["    \"next\": \"16.3.0\","] },
    ],
  },
  {
    subject: "Remove the old pricing page",
    author: "Dana Reyes",
    hoursAgo: 120,
    tag: "v2.3.0",
    files: [
      { path: "src/pages/pricing-old.tsx", status: "D", before: ["export default function OldPricing() {", "  return null;", "}"], after: [] },
    ],
  },
  {
    subject: "Show usage on the account page",
    author: "Sam Okafor",
    coAuthor: CLAUDE,
    hoursAgo: 170,
    files: [
      { path: "src/account/Usage.tsx", status: "A", before: [], after: ["export function Usage({ used, limit }: UsageProps) {", "  return <Meter value={used / limit} />;", "}"] },
    ],
  },
];

function hashOf(project: string, i: number): string {
  let h = 2166136261;
  for (const ch of `${project}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return (h.toString(16).padStart(8, "0") + "c0ffee1234567890abcdef1234567890").slice(0, 40);
}

function sampleParents(i: number): number[] {
  return SAMPLES[i].parents ?? (i + 1 < SAMPLES.length ? [i + 1] : []);
}

function sampleRefs(p: Project, i: number, ahead: number): string[] {
  const branch = p.git.branch || "main";
  const refs: string[] = [];
  if (i === 0) refs.push(branch);
  if (p.git.upstream && i === Math.min(ahead, SAMPLES.length - 1)) refs.push(`origin/${branch}`);
  if (SAMPLES[i].tag) refs.push(SAMPLES[i].tag!);
  return refs;
}

function commitsOf(p: Project) {
  const now = Math.floor(Date.now() / 1000);
  const ahead = Math.min(p.git.ahead, SAMPLES.length);
  return SAMPLES.map((c, i) => {
    const hash = hashOf(p.name, i);
    const parentHashes = sampleParents(i).map((n) => hashOf(p.name, n));
    return {
      hash,
      short: hash.slice(0, 7),
      subject: c.subject,
      body: c.body ?? "",
      author: c.author,
      email: `${c.author.split(" ")[0].toLowerCase()}@example.com`,
      time: now - c.hoursAgo * HOUR,
      parents: parentHashes.length,
      parentHashes,
      refs: sampleRefs(p, i, ahead),
      coAuthors: c.coAuthor ? [c.coAuthor] : [],
      unpushed: i < ahead,
    };
  });
}

function sampleFor(cwd: unknown, hash: unknown): SampleCommit | undefined {
  const p = projectAt(String(cwd));
  return p && SAMPLES.find((_, i) => hashOf(p.name, i) === hash);
}

function patch(f: SampleFile): string {
  const from = f.status === "A" ? "/dev/null" : `a/${f.path}`;
  const to = f.status === "D" ? "/dev/null" : `b/${f.path}`;
  const lines = [
    ...f.before.filter((l) => !f.after.includes(l)).map((l) => `-${l}`),
    ...f.after.map((l) => (f.before.includes(l) ? ` ${l}` : `+${l}`)),
  ];
  return [
    `diff --git a/${f.path} b/${f.path}`,
    `--- ${from}`,
    `+++ ${to}`,
    `@@ -1,${f.before.length} +1,${f.after.length} @@`,
    ...lines,
  ].join("\n");
}

export const historyCommands: CommandMap = {
  git_history: ({ cwd, skip, limit }) => {
    const p = projectAt(String(cwd));
    if (!p) return { commits: [], hasMore: false };
    const from = Number(skip) || 0;
    const page = commitsOf(p).slice(from, from + (Number(limit) || 100));
    return { commits: page, hasMore: false };
  },
  git_commit_files: ({ cwd, hash }) =>
    (sampleFor(cwd, hash)?.files ?? []).map((f) => ({
      path: f.path,
      oldPath: null,
      status: STATUS_LABEL[f.status],
      added: f.after.filter((l) => !f.before.includes(l)).length,
      removed: f.before.filter((l) => !f.after.includes(l)).length,
    })),
  git_commit_file_patch: ({ cwd, hash, path }) => {
    const file = sampleFor(cwd, hash)?.files.find((f) => f.path === path);
    return file ? patch(file) : "";
  },
};
