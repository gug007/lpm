import { MousePointerClick, Radar, RefreshCw } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type Step = {
  icon: typeof Radar;
  title: string;
  body: string;
};

const STEPS: Step[] = [
  {
    icon: MousePointerClick,
    title: "One button, in Settings",
    body: "A single button installs the agent skill and the lpm command-line tool together. It shows Install, Update, or Installed — idempotent, and safe to click again anytime.",
  },
  {
    icon: Radar,
    title: "Agents discover it on their own",
    body: "Every terminal inside lpm knows which project it belongs to. The installed skill triggers whenever an agent sees it, so Claude Code, Codex, Gemini CLI, and OpenCode automatically know they can drive the project — no per-project wiring.",
  },
  {
    icon: RefreshCw,
    title: "Stays current automatically",
    body: "Once you have opted in, updates refresh on their own. The skill is written both for Claude Code and for the open agent-skills directory that Codex, Gemini CLI, and OpenCode read.",
  },
];

export default function Install() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="One-click setup"
          title="Install once, and every agent can drive your projects"
          description="No config to hand-write, no MCP server to run. Click a button in lpm and your AI coding agents gain a command-line tool for your dev environment."
          className="mb-12"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="p-6 sm:p-8 rounded-2xl border border-gray-200 dark:border-gray-800"
            >
              <div className="w-10 h-10 mb-5 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-base font-semibold mb-2 text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
