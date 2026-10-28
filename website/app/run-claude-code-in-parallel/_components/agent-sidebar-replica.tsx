import { AlertCircle, Bell, Check } from "lucide-react";
import VisualPane from "./visual-pane";
import { CODEX_LINES, STATE_TONE, type AgentState } from "./visual-data";

type Agent = { title: string; state: AgentState; elapsed: string };

type Project = {
  name: string;
  running: boolean;
  selected?: boolean;
  problem?: boolean;
  agents: Agent[];
};

const PROJECTS: Project[] = [
  {
    name: "shop-api",
    running: true,
    selected: true,
    agents: [
      { title: "Rate-limit the login route", state: "working", elapsed: "3m 12s" },
      { title: "Tests for auth middleware", state: "needs-you", elapsed: "48s" },
    ],
  },
  {
    name: "shop-api-attempt-2",
    running: false,
    agents: [{ title: "Rate-limit the login route", state: "done", elapsed: "6m" }],
  },
  {
    name: "shop-api-flaky-test",
    running: false,
    problem: true,
    agents: [{ title: "Fix the flaky cart test", state: "error", elapsed: "1m" }],
  },
  {
    name: "web-app",
    running: true,
    agents: [{ title: "Upgrade the checkout form", state: "working", elapsed: "5m 40s" }],
  },
  { name: "docs-site", running: false, agents: [] },
];

const MARK: Record<AgentState, typeof Bell | null> = {
  working: null,
  "needs-you": Bell,
  done: Check,
  error: AlertCircle,
};

function Banner() {
  return (
    <div className="mx-2 mt-2 rounded-xl border border-white/10 bg-[#2b2b2b]/95 p-2.5 shadow-lg shadow-black/50 sm:absolute sm:right-3 sm:top-11 sm:z-20 sm:mx-0 sm:mt-0 sm:w-[16.5rem]">
      <div className="flex items-start gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#111] text-[10px] font-bold text-white ring-1 ring-white/10">
          lpm
        </span>
        <div className="min-w-0 flex-1 text-[11.5px] leading-snug">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold text-white">
              shop-api · Tests for auth middleware
            </span>
            <span className="shrink-0 text-[10.5px] text-[#9a9a9a]">now</span>
          </div>
          <p className="mt-0.5 text-[#c8c8c8]">Needs your approval.</p>
        </div>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <div className="flex w-full shrink-0 flex-col gap-px px-1.5 pb-3 pt-2.5 sm:w-[16.5rem] sm:border-r sm:border-[#262626] sm:bg-[#161616]">
      <span className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500">
        Projects
      </span>
      {PROJECTS.map((project) => (
        <div key={project.name} className="flex flex-col">
          <div
            className={`flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] ${
              project.selected ? "bg-white/[0.08] text-gray-100" : "text-gray-400"
            }`}
          >
            <span
              className={`h-[7px] w-[7px] shrink-0 rounded-full ${
                project.running
                  ? "bg-emerald-400 shadow-[0_0_5px_rgba(16,185,129,0.7)]"
                  : "border border-[#555]"
              }`}
            />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.problem && (
              <span className={`shrink-0 text-[10.5px] font-medium ${STATE_TONE.error}`}>
                Problem
              </span>
            )}
          </div>
          {project.agents.map((agent) => {
            const Mark = MARK[agent.state];
            return (
              <div
                key={agent.title}
                className="flex items-center gap-2 py-[5px] pl-[1.85rem] pr-2.5 text-[11.5px]"
              >
                <span className={`min-w-0 flex-1 truncate ${STATE_TONE[agent.state]}`}>
                  {agent.title}
                </span>
                <span className={`h-3 w-3 shrink-0 ${STATE_TONE[agent.state]}`}>
                  {Mark && <Mark className="h-3 w-3" strokeWidth={2.25} />}
                </span>
                <span className="w-10 shrink-0 text-right text-[10.5px] tabular-nums text-gray-500">
                  {agent.elapsed}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function AgentSidebarReplica() {
  return (
    <div
      data-on-dark
      aria-hidden="true"
      className="relative overflow-hidden rounded-xl bg-[#111113] p-1.5 shadow-2xl shadow-gray-300/60 ring-1 ring-black/15 dark:shadow-black/60 dark:ring-[#3a3a3c]"
    >
      <div className="overflow-hidden rounded-lg bg-[#161616]">
        <div className="flex h-8 items-center gap-1.5 border-b border-[#262626] px-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <Banner />
        <div className="flex sm:h-[21.5rem]">
          <Sidebar />
          <VisualPane
            className="hidden flex-1 sm:flex"
            lines={CODEX_LINES}
            tabs={[
              {
                glyph: "✻",
                glyphClass: "text-[#d97757]",
                title: "Rate-limit the login route",
                state: "working",
              },
              {
                glyph: "◆",
                glyphClass: "text-[#67e8f9]",
                title: "Tests for auth middleware",
                state: "needs-you",
                active: true,
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
