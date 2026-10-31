import { Check, Plus } from "lucide-react";
import { ReplicaProjectRow } from "./before-after-project-row";
import { RUNNING_ZAP, Tab } from "./before-after-tab";

export type StepArtKind = "folder" | "start" | "agents";

// Each step drawn in the app's own parts and palette, the same ones the
// before-and-after section above it uses, so the cards preview what the
// visitor will actually see.
const ART: Record<StepArtKind, React.ReactNode> = {
  folder: (
    <div className="flex h-full flex-col gap-[0.5em] p-[0.6em]">
      <div className="flex items-center justify-between px-[0.4em] text-[0.85em] font-medium uppercase tracking-wider text-[#919191]">
        Projects
        <Plus className="h-[1.1em] w-[1.1em]" strokeWidth={1.5} />
      </div>
      <ReplicaProjectRow row={{ name: "storefront", running: false, selected: true }} />
      <div className="mt-auto flex items-center gap-[0.5em] rounded-[0.5em] bg-[#2d2d2d] px-[0.7em] py-[0.45em] text-[#d4d4d4] ring-1 ring-white/5">
        <Check className="h-[1em] w-[1em] shrink-0 text-emerald-400" strokeWidth={2.5} />
        <span className="min-w-0 truncate">Found 3 services: web, api, worker</span>
      </div>
    </div>
  ),
  start: (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-[0.3em] overflow-hidden bg-[#2d2d2d] px-[0.45em] py-[0.4em]">
        <Tab compact icon={RUNNING_ZAP} port=":3000">
          web
        </Tab>
        <Tab compact icon={RUNNING_ZAP} port=":8080">
          api
        </Tab>
        <Tab compact icon={RUNNING_ZAP}>
          worker
        </Tab>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-[0.15em] px-[0.9em] py-[0.6em] font-mono text-[0.95em] leading-[1.5]">
        <span className="text-[#8d8d8d]">▲ Next.js 16.3.0</span>
        <span className="text-[#9a9a9a]">
          - Local: <span className="text-[#d4d4d4]">localhost:3000</span>
        </span>
        <span className="text-[#9a9a9a]">✓ Ready in 268ms</span>
      </div>
    </div>
  ),
  agents: (
    <div className="flex h-full flex-col justify-center gap-[0.3em] px-[0.6em]">
      <ReplicaProjectRow
        row={{
          name: "storefront",
          running: true,
          agent: { name: "claude", state: "working", elapsed: "1m" },
        }}
      />
      <ReplicaProjectRow
        row={{
          name: "storefront-2",
          running: true,
          agent: { name: "codex", state: "done", elapsed: "48s" },
        }}
      />
    </div>
  ),
};

export function HowItWorksArt({ kind }: { kind: StepArtKind }) {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className="replica-ui h-32 overflow-hidden md:h-[9.5rem] rounded-xl bg-[#1e1e1e] text-[12px] ring-1 ring-black/5 select-none dark:ring-white/10"
    >
      {ART[kind]}
    </div>
  );
}
