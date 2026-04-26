import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Onboard to a remote dev box without typing a single connection detail",
    body: (
      <>
        A teammate hands you their <code className="text-xs">~/.ssh/config</code>{" "}
        snippet — a <code className="text-xs">Host devbox</code> entry with{" "}
        <code className="text-xs">ProxyJump bastion</code> and the right key
        path. You paste it into your config, click &ldquo;Add a project&rdquo;
        in lpm, choose &ldquo;SSH Host&rdquo;, and pick{" "}
        <code className="text-xs">devbox</code> from the dropdown. Pick any host
        from <code className="text-xs">~/.ssh/config</code> and the form fills
        itself while preserving the <code className="text-xs">devbox</code>{" "}
        alias, so OpenSSH still applies the{" "}
        <code className="text-xs">ProxyJump</code> rule. The first ssh
        invocation prompts for your bastion 2FA once; from then on, the
        multiplexed channel stays open and every service, action, and terminal
        reuses it. You&rsquo;re inside the dev box without typing a host, a
        user, a port, or a key path.
      </>
    ),
  },
  {
    title: "Push a hotfix to staging without stopping your local stack",
    body: (
      <>
        Your local <code className="text-xs">frontend</code> and{" "}
        <code className="text-xs">api</code> are streaming logs in two panes. A
        bug needs to ship to staging fast. Open the staging project (already
        configured against the remote host), run{" "}
        <code className="text-xs">migrate</code> as an action with{" "}
        <code className="text-xs">mode: remote</code>, and watch the staging API
        pane stream the deploy output. Forward the staging API port to localhost
        from the Ports popover to verify the fix in your browser. Your local
        panes never stopped — when you&rsquo;re done, click back to the local
        project and pick up exactly where you were.
      </>
    ),
  },
  {
    title: "Forward a remote dev server to localhost the moment it starts",
    body: (
      <>
        You start the remote project&rsquo;s <code className="text-xs">api</code>{" "}
        service. It prints{" "}
        <code className="text-xs">Listening on http://0.0.0.0:8080</code> into
        its pane. lpm sees the URL in the output, matches it against the
        declared service port, and auto-forwards — the toast reads{" "}
        <code className="text-xs">
          Auto-forwarded :8080 → http://localhost:8080
        </code>
        . Open the URL locally; your browser is talking to the remote process
        through the SSH channel without you typing a single{" "}
        <code className="text-xs">-L</code> flag. Stop the project and the
        forward dies cleanly. No orphans, no lingering tunnels.
      </>
    ),
  },
];

export default function Workflows() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="In practice"
          title="Three real remote-dev scenarios your Mac terminal should make trivial"
          description="Three concrete moments where the local-vs-remote split costs real time — and how lpm collapses them into one window."
        />

        <div className="space-y-12">
          {WORKFLOWS.map((workflow, i) => (
            <div key={workflow.title} className="relative pl-10">
              <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-xs font-bold text-white dark:text-gray-900">
                {i + 1}
              </div>
              <h3 className="text-lg font-semibold mb-1.5">{workflow.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {workflow.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
