import { MousePointerClick, Sparkles, Wrench } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";
import { CONNECT_AGENTS_PATH } from "@/lib/links";
import { DocLink } from "../doc-link";
import { AgentTranscript } from "./agent-transcript";
import { PromptExampleCard } from "./prompt-example-card";
import { PROMPT_EXAMPLES } from "./prompt-examples-data";

const CODE = "font-mono text-[12px] text-gray-700 dark:text-gray-300";

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "Install Agent tools",
    body: (
      <>
        In lpm, open Settings &rarr; General and click Install next to Agent
        tools, or use the Agent tools button in the sidebar. It adds the lpm
        skills for Claude Code, Codex, Gemini CLI, and OpenCode, plus the{" "}
        <code className={CODE}>lpm</code>{" "}command.
      </>
    ),
  },
  {
    title: "Open an agent in the project",
    body: (
      <>
        Click Claude Code or Codex in the project&rsquo;s toolbar. The agent
        starts in the project&rsquo;s folder, so it knows which config to
        change without you naming it.
      </>
    ),
  },
  {
    title: "Say what you want",
    body: (
      <>
        The agent picks the file — just you, the team&rsquo;s{" "}
        <code className={CODE}>.lpm.yml</code>, or every project — and lpm
        checks the change before it lands. A mistake goes back to the agent to
        fix, the file is never left half-written, and edits you make in the
        app meanwhile aren&rsquo;t overwritten.
      </>
    ),
  },
];

export function AgentSection() {
  return (
    <section id="with-ai" className="mb-14 scroll-mt-24 sm:mb-16">
      <SectionHeader
        eyebrow="With AI agents"
        title="Configure lpm by asking your agent"
        description="lpm comes with skills that teach coding agents its config. Say what you want, and the project updates in place — no keys to learn."
        className="mb-10"
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
        <ol className="space-y-6">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white dark:bg-white dark:text-gray-900"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {step.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <AgentTranscript />
      </div>

      <h3 className="mt-14 mb-4 text-lg font-semibold">Things you can ask</h3>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PROMPT_EXAMPLES.map((example) => (
          <PromptExampleCard key={example.prompt} {...example} />
        ))}
      </ul>

      <h3 className="mt-14 mb-4 text-lg font-semibold">
        AI inside the app, too
      </h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <FeatureCard icon={Sparkles} title="Generate a config">
          In a project&rsquo;s config editor, click Generate with AI and pick
          an installed agent. It drafts the whole file from your code, unsaved
          until you review it.
        </FeatureCard>
        <FeatureCard icon={MousePointerClick} title="Describe a button">
          In the action editor, describe what a button should do and AI fills
          in its fields. On an existing button, Edit with AI changes it.
        </FeatureCard>
        <FeatureCard icon={Wrench} title="Fix a broken file">
          When a config won&rsquo;t load, the notice says what&rsquo;s wrong
          and offers Fix with AI, which repairs it for you to review and save.
        </FeatureCard>
      </div>

      <p className="mt-6 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        The same Agent tools let agents start and stop services, read logs, and
        duplicate projects:{" "}
        <DocLink href={CONNECT_AGENTS_PATH}>
          let Claude Code and Codex run your dev environment
        </DocLink>
        .
      </p>
    </section>
  );
}
