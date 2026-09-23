import { SectionHeader } from "@/components/section-header";

type Workflow = {
  title: string;
  body: React.ReactNode;
};

const WORKFLOWS: Workflow[] = [
  {
    title: "Go from a fresh clone to a running stack",
    body: (
      <>
        Paste the repo URL into Add a project and choose Clone Repository, or
        add a folder you already have. lpm reads the manifests and sets up the
        services, whether Rails, Next.js, Django, Go, Docker Compose, or a
        Procfile. Hit Start and every service streams live output side by
        side, with no digging through the README for start commands.
      </>
    ),
  },
  {
    title: "Switch between client projects without losing state",
    body: (
      <>
        Each project gets its own sidebar entry with live status. Leave the
        first running while you jump to the second; both keep their servers,
        their terminal history, and their logs. When you switch back, nothing
        has to reboot.
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
          description="Three everyday flows for Mac developers, built around a native workspace."
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
