import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Boot your full stack on a fresh MacBook in under a minute",
    body: (
      <>
        Clone the repo, open the folder in lpm, and the config editor
        auto-detects Rails, Next.js, Go, Django, Flask, or Docker Compose. Hit
        Start and every service streams live output side by side — no Brewfile
        archaeology, no README spelunking.
      </>
    ),
  },
  {
    title: "Switch between client projects without losing state",
    body: (
      <>
        Each project gets its own sidebar entry with live status. Pause the
        first while you jump to the second; both keep their servers, their
        terminal history, and their logs. When you switch back, nothing has to
        reboot.
      </>
    ),
  },
  {
    title: "Use your shell of choice alongside git and your services",
    body: (
      <>
        lpm panes are real terminals — zsh, bash, or fish, with your dotfiles
        intact. Run <code className="text-xs">git rebase -i</code> in one pane,{" "}
        <code className="text-xs">npm run dev</code> in another, and{" "}
        <code className="text-xs">rails console</code> in a third, all in the
        same macOS window.
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
          title="Workflows your terminal on Mac should actually make easy"
          description="Three everyday flows for Mac developers, reimagined around a native workspace."
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
