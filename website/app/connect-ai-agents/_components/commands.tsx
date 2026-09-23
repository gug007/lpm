import { Fragment } from "react";
import { CodeBlock, Comment } from "@/components/config/code-block";
import { SectionHeader } from "@/components/section-header";

export default function Commands() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The CLI, up close"
          title="Real commands your agents run"
          description="These are the commands the skill teaches. Project name is inferred from the terminal, so agents rarely have to name it."
        />

        <div className="space-y-8">
          <CodeBlock filename="Inspect what's running">
            <Comment># Every project, its running state, and active agents</Comment>
            {"\n"}lpm list --json
            {"\n\n"}
            <Comment># One project&apos;s services, actions, and live status</Comment>
            {"\n"}lpm project myapp
            {"\n\n"}
            <Comment># Live agent status across projects</Comment>
            {"\n"}lpm status
          </CodeBlock>

          <CodeBlock filename="Control services">
            <Comment># Start the whole project, or just one profile</Comment>
            {"\n"}lpm start myapp
            {"\n"}lpm start myapp --profile backend
            {"\n"}lpm stop myapp
            {"\n\n"}
            <Comment># Restart a single dev server</Comment>
            {"\n"}lpm service api restart
          </CodeBlock>

          <CodeBlock filename="Read logs and wait for readiness">
            <Comment># Last 200 lines of a running service</Comment>
            {"\n"}lpm logs frontend -n 200
            {"\n\n"}
            <Comment># Block until a port answers — no blind sleep loops</Comment>
            {"\n"}lpm wait --port 3000 --timeout 60
          </CodeBlock>

          <CodeBlock filename="Run actions and report status">
            <Comment># Open Claude Code in a new lpm terminal with a prompt</Comment>
            {"\n"}lpm run claude --prompt &quot;fix the failing spec&quot;
            {"\n\n"}
            <Comment># Flag the project as waiting on you in the sidebar</Comment>
            {"\n"}lpm set-status review Waiting
          </CodeBlock>
        </div>

        <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
          {(
            [
              ["0", "success"],
              ["2", "not found / app not running"],
              ["1", "error / timeout"],
            ] as const
          ).map(([code, label], i) => (
            <Fragment key={code}>
              {i > 0 && (
                <span
                  aria-hidden="true"
                  className="mx-2 text-gray-300 dark:text-gray-600"
                >
                  ·
                </span>
              )}
              <span className="font-mono text-gray-600 dark:text-gray-300">
                exit {code}
              </span>{" "}
              {label}
            </Fragment>
          ))}
        </p>
      </div>
    </section>
  );
}
