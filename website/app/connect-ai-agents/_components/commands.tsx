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
          description="These are the exact commands the skill teaches. Project name is inferred from the terminal, so agents rarely have to name it."
        />

        <div className="space-y-8">
          <CodeBlock filename="Inspect what's running">
            <Comment># Every project, its running state, and active agents</Comment>
            {"\n"}lpm list --json
            {"\n\n"}
            <Comment># One project&apos;s services, actions, and live status</Comment>
            {"\n"}lpm project myapp --full
            {"\n\n"}
            <Comment># Live agent status across projects</Comment>
            {"\n"}lpm status
          </CodeBlock>

          <CodeBlock filename="Control services">
            <Comment># Start or stop the whole project</Comment>
            {"\n"}lpm start myapp --profile full
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
            <Comment># Queue an action in a new lpm terminal</Comment>
            {"\n"}lpm run test --prompt &quot;fix the failing spec&quot;
            {"\n\n"}
            <Comment># Post a custom status badge into the lpm UI</Comment>
            {"\n"}lpm set-status deploy &quot;waiting on review&quot;
          </CodeBlock>
        </div>

        <p className="mt-8 text-center text-xs text-gray-400 dark:text-gray-500 leading-relaxed">
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
