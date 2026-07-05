"use client";

import { useEffect, useRef, useState } from "react";
import { GitBranch } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type DiffLine = { t: "hunk" | "ctx" | "add" | "del"; text: string };
type Status = "modified" | "added" | "deleted";
type ChangedFile = { path: string; status: Status; diff: DiffLine[] };

const FILES: ChangedFile[] = [
  {
    path: "src/lib/billing.ts",
    status: "modified",
    diff: [
      { t: "hunk", text: "@@ -14,9 +14,12 @@ export async function createSubscription(" },
      { t: "ctx", text: "  const customer = await stripe.customers.create({ email });" },
      { t: "del", text: "  const price = PRICES[plan];" },
      { t: "add", text: "  const price = PRICES[plan] ?? PRICES.starter;" },
      { t: "add", text: "  if (!price) throw new Error(`Unknown plan: ${plan}`);" },
      { t: "ctx", text: "  return stripe.subscriptions.create({" },
      { t: "ctx", text: "    customer: customer.id," },
      { t: "add", text: "    trial_period_days: 14," },
      { t: "ctx", text: "    items: [{ price }]," },
      { t: "ctx", text: "  });" },
    ],
  },
  {
    path: "src/routes/webhook.ts",
    status: "added",
    diff: [
      { t: "hunk", text: "@@ -0,0 +1,17 @@" },
      { t: "add", text: 'import { stripe } from "../lib/billing";' },
      { t: "add", text: "" },
      { t: "add", text: "export async function POST(req: Request) {" },
      { t: "add", text: '  const sig = req.headers.get("stripe-signature");' },
      { t: "add", text: "  const body = await req.text();" },
      { t: "add", text: "  const event = stripe.webhooks.constructEvent(body, sig, SECRET);" },
      { t: "add", text: "" },
      { t: "add", text: "  switch (event.type) {" },
      { t: "add", text: '    case "invoice.paid":' },
      { t: "add", text: "      await activateAccount(event.data.object);" },
      { t: "add", text: "      break;" },
      { t: "add", text: '    case "customer.subscription.deleted":' },
      { t: "add", text: "      await revokeAccess(event.data.object);" },
      { t: "add", text: "      break;" },
      { t: "add", text: "  }" },
      { t: "add", text: "  return new Response(null, { status: 200 });" },
      { t: "add", text: "}" },
    ],
  },
  {
    path: "src/components/PlanCard.tsx",
    status: "modified",
    diff: [
      { t: "hunk", text: "@@ -8,7 +8,9 @@ export function PlanCard({ plan }: Props) {" },
      { t: "ctx", text: "  return (" },
      { t: "del", text: '    <div className="rounded-lg border p-4">' },
      { t: "add", text: '    <div className="rounded-xl border p-5 shadow-sm">' },
      { t: "add", text: "      {plan.popular && <Badge>Most popular</Badge>}" },
      { t: "ctx", text: "      <h3>{plan.name}</h3>" },
      { t: "del", text: "      <p>{plan.price}/mo</p>" },
      { t: "add", text: '      <p className="text-2xl font-semibold">${plan.price}/mo</p>' },
      { t: "ctx", text: "    </div>" },
    ],
  },
  {
    path: "src/lib/legacy-pricing.ts",
    status: "deleted",
    diff: [
      { t: "hunk", text: "@@ -1,8 +0,0 @@" },
      { t: "del", text: "export const LEGACY_PRICES = {" },
      { t: "del", text: "  free: 0," },
      { t: "del", text: "  pro: 12," },
      { t: "del", text: "  team: 29," },
      { t: "del", text: "};" },
      { t: "del", text: "" },
      { t: "del", text: "export function priceFor(plan: string) {" },
      { t: "del", text: "  return LEGACY_PRICES[plan] ?? 0;" },
      { t: "del", text: "}" },
    ],
  },
];

const STATUS: Record<Status, { label: string; color: string; title: string }> = {
  modified: { label: "M", color: "text-[#60a5fa]", title: "Modified" },
  added: { label: "A", color: "text-[#4ade80]", title: "Added" },
  deleted: { label: "D", color: "text-[#f87171]", title: "Deleted" },
};

type Numbered = DiffLine & { oldNo: number | null; newNo: number | null };

function withLineNumbers(diff: DiffLine[]): Numbered[] {
  let oldNo = 0;
  let newNo = 0;
  return diff.map((line) => {
    if (line.t === "hunk") {
      const m = line.text.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldNo = Number(m[1]);
        newNo = Number(m[2]);
      }
      return { ...line, oldNo: null, newNo: null };
    }
    if (line.t === "add") {
      const n = newNo;
      newNo += 1;
      return { ...line, oldNo: null, newNo: n };
    }
    if (line.t === "del") {
      const o = oldNo;
      oldNo += 1;
      return { ...line, oldNo: o, newNo: null };
    }
    const o = oldNo;
    const n = newNo;
    oldNo += 1;
    newNo += 1;
    return { ...line, oldNo: o, newNo: n };
  });
}

function splitPath(path: string) {
  const name = path.split("/").pop() ?? path;
  const dir = path.slice(0, path.length - name.length);
  return { name, dir };
}

function ReviewViewer() {
  const [active, setActive] = useState(0);
  const diffRef = useRef<HTMLDivElement>(null);
  const fileButtonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const file = FILES[active];
  const numbered = withLineNumbers(file.diff);

  useEffect(() => {
    if (diffRef.current) diffRef.current.scrollTop = 0;
  }, [active]);

  const move = (delta: number) => {
    const next = (active + delta + FILES.length) % FILES.length;
    setActive(next);
    fileButtonsRef.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "j") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp" || e.key === "k") {
      e.preventDefault();
      move(-1);
    }
  };

  return (
    <div
      onKeyDown={onKeyDown}
      className="mx-auto max-w-5xl overflow-hidden rounded-xl border border-gray-200 bg-[#1a1a1a] shadow-2xl shadow-gray-900/10 dark:border-[#2e2e2e] dark:shadow-black/40"
    >
      <div className="flex items-center gap-2 border-b border-[#2e2e2e] bg-[#161616] px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="flex-1 text-center text-[11px] font-medium text-[#b3b3b3]">
          saas-app · Review changes
        </span>
        <kbd className="hidden shrink-0 items-center gap-0.5 rounded border border-[#3a3a3a] bg-[#242424] px-1.5 py-0.5 font-mono text-[10px] text-[#8e8e8e] sm:inline-flex">
          ⌘⇧R
        </kbd>
      </div>

      <div className="flex items-center gap-2 border-b border-[#2e2e2e] px-3.5 py-2 text-[11px]">
        <span className="font-medium text-[#e5e5e5]">Changes</span>
        <span className="text-[#8e8e8e]">{FILES.length} files</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-[#2e2e2e] bg-[#242424] px-2 py-0.5 font-mono text-[10px] text-[#b3b3b3]">
          <GitBranch className="h-3 w-3 text-[#8e8e8e]" />
          feat/billing
        </span>
      </div>

      <div className="flex sm:hidden gap-1.5 overflow-x-auto border-b border-[#2e2e2e] px-3 py-2">
        {FILES.map((f, i) => {
          const st = STATUS[f.status];
          const { name } = splitPath(f.path);
          return (
            <button
              key={f.path}
              type="button"
              onClick={() => setActive(i)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] transition-colors ${
                i === active
                  ? "bg-[#2a2a2a] text-[#e5e5e5]"
                  : "text-[#b3b3b3] hover:bg-[#242424]"
              }`}
            >
              <span className={`font-mono font-semibold ${st.color}`}>
                {st.label}
              </span>
              {name}
            </button>
          );
        })}
      </div>

      <div className="flex h-[380px] min-h-0 sm:h-[440px]">
        <div className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-[#2e2e2e] py-1.5 sm:flex">
          {FILES.map((f, i) => {
            const st = STATUS[f.status];
            const { name, dir } = splitPath(f.path);
            return (
              <button
                key={f.path}
                type="button"
                ref={(el) => {
                  fileButtonsRef.current[i] = el;
                }}
                onClick={() => setActive(i)}
                aria-current={i === active}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                  i === active
                    ? "bg-[#2a2a2a] text-[#e5e5e5]"
                    : "text-[#b3b3b3] hover:bg-[#242424]"
                }`}
              >
                <span
                  title={st.title}
                  className={`w-2.5 shrink-0 text-center font-mono font-semibold ${st.color}`}
                >
                  {st.label}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#7a7a7a]">{dir}</span>
                  {name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-[#2e2e2e] px-3.5 py-1.5 font-mono text-[11px] text-[#b3b3b3]">
            <span className={`font-semibold ${STATUS[file.status].color}`}>
              {STATUS[file.status].label}
            </span>
            <span className="truncate">{file.path}</span>
          </div>
          <div
            ref={diffRef}
            className="min-h-0 flex-1 overflow-auto font-mono text-[12px] leading-[1.6]"
          >
            {numbered.map((ln, i) => {
              if (ln.t === "hunk") {
                return (
                  <div
                    key={i}
                    className="bg-[#60a5fa]/[0.06] px-3 py-0.5 text-[#60a5fa]"
                  >
                    {ln.text}
                  </div>
                );
              }
              const rowBg =
                ln.t === "add"
                  ? "bg-[#4ade80]/[0.08]"
                  : ln.t === "del"
                    ? "bg-[#f87171]/[0.08]"
                    : "";
              const txt =
                ln.t === "add"
                  ? "text-[#86efac]"
                  : ln.t === "del"
                    ? "text-[#fca5a5]"
                    : "text-[#b9b9b9]";
              const sign = ln.t === "add" ? "+" : ln.t === "del" ? "-" : " ";
              return (
                <div key={i} className={`flex ${rowBg}`}>
                  <span className="w-9 shrink-0 select-none px-1 text-right text-[11px] text-[#4d4d4d]">
                    {ln.oldNo ?? ""}
                  </span>
                  <span className="w-9 shrink-0 select-none px-1 text-right text-[11px] text-[#4d4d4d]">
                    {ln.newNo ?? ""}
                  </span>
                  <span className={`w-4 shrink-0 select-none text-center ${txt}`}>
                    {sign}
                  </span>
                  <span className={`min-w-0 flex-1 whitespace-pre pr-3 ${txt}`}>
                    {ln.text || " "}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-[#2e2e2e] bg-[#161616] px-3.5 py-1.5 text-[10px] text-[#7a7a7a]">
        <span>Reviewing before commit — no browser tab</span>
        <span className="hidden sm:inline">
          <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd>{" "}
          to move between files
        </span>
      </div>
    </div>
  );
}

export default function ReviewDemo() {
  return (
    <section
      id="demo"
      aria-label="Interactive diff review demo"
      className="scroll-mt-20 py-12 sm:py-16"
    >
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <SectionHeader
          eyebrow={
            <span className="inline-flex items-center gap-1.5">
              <span className="relative inline-flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Try it
            </span>
          }
          title="A full diff review, right in your workspace"
          description="Click any file to read its diff. Modified, added, and deleted — every change laid out before you commit, without leaving the terminal."
          className="mb-8"
        />
        <ReviewViewer />
      </div>
    </section>
  );
}
