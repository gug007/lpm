"use client";

import { useState } from "react";
import type { DemoProject } from "./projects";

type DiffLine = { t: "hunk" | "ctx" | "add" | "del"; text: string };

type ChangedFile = {
  path: string;
  status: "modified" | "added" | "deleted";
  add: number;
  del: number;
  diff: DiffLine[];
};

const FILES: ChangedFile[] = [
  {
    path: "src/lib/billing.ts",
    status: "modified",
    add: 24,
    del: 6,
    diff: [
      { t: "hunk", text: "@@ -14,7 +14,9 @@ export async function createSubscription(" },
      { t: "ctx", text: "   const customer = await stripe.customers.create({ email });" },
      { t: "del", text: "-  const price = PRICES[plan];" },
      { t: "add", text: "+  const price = PRICES[plan] ?? PRICES.starter;" },
      { t: "add", text: "+  if (!price) throw new Error(`Unknown plan: ${plan}`);" },
      { t: "ctx", text: "   return stripe.subscriptions.create({" },
      { t: "ctx", text: "     customer: customer.id," },
      { t: "add", text: "+    trial_period_days: 14," },
      { t: "ctx", text: "   });" },
    ],
  },
  {
    path: "src/components/PlanCard.tsx",
    status: "modified",
    add: 12,
    del: 3,
    diff: [
      { t: "hunk", text: "@@ -8,5 +8,7 @@ export function PlanCard({ plan }: Props) {" },
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
    add: 48,
    del: 0,
    diff: [
      { t: "hunk", text: "@@ -0,0 +1,48 @@" },
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
];

const STATUS = {
  modified: { label: "M", color: "text-[#60a5fa]" },
  added: { label: "A", color: "text-[#4ade80]" },
  deleted: { label: "D", color: "text-[#f87171]" },
} as const;

export function ReviewView({ project }: { project: DemoProject }) {
  const [active, setActive] = useState(0);
  const file = FILES[active];
  const totalAdd = FILES.reduce((n, f) => n + f.add, 0);
  const totalDel = FILES.reduce((n, f) => n + f.del, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[#2e2e2e] px-3 py-2 text-[11px]">
        <span className="font-medium text-[#e5e5e5]">
          {FILES.length} files changed
        </span>
        <span className="font-mono text-[#4ade80]">+{totalAdd}</span>
        <span className="font-mono text-[#f87171]">−{totalDel}</span>
        <span className="ml-auto truncate font-mono text-[10px] text-[#666]">
          {project.root}
        </span>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-52 shrink-0 overflow-y-auto border-r border-[#2e2e2e] py-1">
          {FILES.map((f, i) => {
            const st = STATUS[f.status];
            const name = f.path.split("/").pop();
            const dir = f.path.slice(0, f.path.length - (name?.length ?? 0));
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => setActive(i)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                  i === active
                    ? "bg-[#2a2a2a] text-[#e5e5e5]"
                    : "text-[#b3b3b3] hover:bg-[#242424]"
                }`}
              >
                <span className={`w-2.5 shrink-0 text-center font-mono font-semibold ${st.color}`}>
                  {st.label}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="text-[#8e8e8e]">{dir}</span>
                  {name}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#4ade80]">
                  +{f.add}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-[#f87171]">
                  −{f.del}
                </span>
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 overflow-auto">
          <div className="border-b border-[#2e2e2e] px-3 py-1.5 font-mono text-[11px] text-[#b3b3b3]">
            {file.path}
          </div>
          <pre className="px-3 py-2 font-mono text-[11px] leading-[1.6]">
            {file.diff.map((line, i) => {
              const cls =
                line.t === "add"
                  ? "bg-[#4ade80]/10 text-[#86efac]"
                  : line.t === "del"
                    ? "bg-[#f87171]/10 text-[#fca5a5]"
                    : line.t === "hunk"
                      ? "text-[#60a5fa]"
                      : "text-[#8e8e8e]";
              return (
                <div key={i} className={cls}>
                  {line.text || " "}
                </div>
              );
            })}
          </pre>
        </div>
      </div>
    </div>
  );
}
