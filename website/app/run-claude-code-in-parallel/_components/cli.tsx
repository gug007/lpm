import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { CONNECT_AGENTS_PATH } from "@/lib/links";

const CODE =
  "rounded bg-gray-100 px-1 py-0.5 font-mono text-[0.85em] text-gray-800 dark:bg-white/[0.07] dark:text-gray-200";
const LINK =
  "font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100";

export default function Cli() {
  return (
    <section id="cli" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="From the terminal"
          title="Script the fan-out, or let an agent do it"
          description="The lpm command line tool drives the same app, so every copy it makes shows up in the sidebar with live status."
        />
        <div className="grid gap-10 lg:grid-cols-5 lg:items-start">
          <div className="min-w-0 lg:col-span-3">
            <CodeBlock filename="Terminal">
              <Comment># three copies, each starting Claude Code on the same prompt</Comment>
              {"\n"}lpm duplicate -n 3 --command claude --prompt &quot;Rate-limit the login route&quot;
              {"\n\n"}
              <Comment># or three worktrees on their own lpm/ branches, with Codex</Comment>
              {"\n"}lpm worktree -n 3 --command codex --prompt &quot;Rate-limit the login route&quot;
              {"\n\n"}
              <Comment># another agent tab in the project you are in</Comment>
              {"\n"}lpm run --command claude --prompt &quot;Write tests for the rate limiter&quot;
              {"\n\n"}
              <Comment># who is working, who is waiting</Comment>
              {"\n"}lpm status
              {"\n\n"}
              <Comment># block until one copy&apos;s agents stop working</Comment>
              {"\n"}lpm wait shop-api-Xq4t7B --agent --timeout 1800
            </CodeBlock>
          </div>
          <ul className="space-y-6 lg:col-span-2">
            <li>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Built for scripts
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Add <code className={CODE}>--json</code>{" "}
                for machine-readable output. Inside an lpm terminal or a project
                folder the project name is optional, and{" "}
                <code className={CODE}>lpm list</code>{" "}
                shows every project and copy by name.
              </p>
            </li>
            <li>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                The app does the work
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Commands that create or change something need lpm running on
                your Mac. Up to 50 copies or worktrees per command.
              </p>
            </li>
            <li>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Agents can do it themselves
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Install the lpm skills once and your agent can make its own
                copies, kick off work in each and wait until they settle. That
                works in Claude Code, Codex, Gemini CLI and OpenCode.{" "}
                <Link href={CONNECT_AGENTS_PATH} className={LINK}>
                  Connect your agents
                </Link>
                .
              </p>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
