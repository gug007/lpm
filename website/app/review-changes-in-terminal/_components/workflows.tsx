import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Vet what your AI agent changed before you accept it",
    body: (
      <>
        Claude Code just refactored your billing module across eight files. Open
        the review pane with{" "}
        <code className="text-xs">⌘⇧R</code>, walk the diff file by file, and
        catch the one place it dropped a null check. Fix it in the editor pane
        beside the diff, then commit — all without leaving the agent&rsquo;s
        window.
      </>
    ),
  },
  {
    title: "Read your own diff before every commit",
    body: (
      <>
        You&rsquo;ve been heads-down for an hour. Before you{" "}
        <code className="text-xs">git commit</code>, open the review pane and
        actually read what you&rsquo;re about to ship. The stray{" "}
        <code className="text-xs">console.log</code>, the commented-out block,
        the file you didn&rsquo;t mean to touch — you see them here, not in code
        review tomorrow.
      </>
    ),
  },
  {
    title: "Catch a regression while the test is still on screen",
    body: (
      <>
        A test just went red in one pane. Open the diff in another, scan what
        changed, and spot the off-by-one immediately — the failing output and
        the offending line are on screen at the same time. Re-run the test in
        the pane next door and watch it go green.
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
          title="When reviewing changes in the terminal actually pays off"
          description="Three moments where jumping to a separate diff tool costs real time — and how lpm keeps the review right where the work is."
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
