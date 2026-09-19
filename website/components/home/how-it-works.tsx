import { SectionHeader } from "@/components/section-header";
import { YouTubeVideo } from "@/components/youtube-video";
import { YOUTUBE_PLAYLIST_URL, type YouTubeLessonId } from "@/lib/youtube-lessons";

type Step = {
  n: number;
  title: string;
  body: React.ReactNode;
  lesson: YouTubeLessonId;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: "Add a new project",
    body: (
      <>
        Click <strong>+</strong> in the sidebar and pick a local folder, or
        paste a Git URL and lpm clones it for you. The project appears in the
        sidebar ready to start.
      </>
    ),
    lesson: "add-project",
  },
  {
    n: 2,
    title: "Start a project",
    body: (
      <>
        Select a project and click Start. All services launch in parallel with
        live terminal output side by side. Switch between service tabs or view
        them all at once.
      </>
    ),
    lesson: "start-project",
  },
  {
    n: 3,
    title: "Add an action",
    body: (
      <>
        Add one-shot commands like linters, test runners, or deploy scripts
        directly in the editor. Actions appear as buttons you can trigger
        without leaving the app.
      </>
    ),
    lesson: "add-action",
  },
  {
    n: 4,
    title: "Switch between profiles",
    body: (
      <>
        Define profiles to run different subsets of services. Toggle between
        them with the profile switcher in the header — pick{" "}
        <strong>default</strong> for everyday work or <strong>full</strong> when
        you need everything running.
      </>
    ),
    lesson: "switch-profiles",
  },
  {
    n: 5,
    title: "Launch your AI agent in one click",
    body: (
      <>
        Configure any command you want —{" "}
        <strong>Claude</strong>, <strong>Codex</strong>, Aider, a custom script,
        anything. Pick a project, click the button, and the terminal opens with
        your agent already running in the right directory. No <code>cd</code>,
        no setup, no excuses. From zero to coding in seconds.
      </>
    ),
    lesson: "sixty-seconds",
  },
  {
    n: 6,
    title: "Run agents in parallel on the same codebase",
    body: (
      <>
        Duplicate a project to spin up a second (or third) checkout in seconds.
        Each copy gets its own services, terminals, and agents — so{" "}
        <strong>Claude</strong> can work on one feature while{" "}
        <strong>Codex</strong> ships another, without branch conflicts or
        context bleed.
      </>
    ),
    lesson: "parallel-agents",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 sm:py-24 border-y border-gray-200 dark:border-gray-800/60 bg-gray-50/60 dark:bg-white/[0.015]">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it works"
          title="From folder to running agents in six steps"
        />

        <div className="space-y-12">
          {STEPS.map((step) => (
            <div key={step.n} className="relative pl-10">
              <div className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-gray-900 dark:bg-white text-xs font-bold text-white dark:text-gray-900">
                {step.n}
              </div>
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-1.5">{step.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {step.body}
                </p>
              </div>
              <YouTubeVideo
                lesson={step.lesson}
                className="rounded-lg shadow-2xl shadow-gray-200/60 dark:shadow-black/40"
              />
            </div>
          ))}
        </div>

        <p className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
          Want the full series?{" "}
          <a
            href={YOUTUBE_PLAYLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-gray-300 underline-offset-4 transition-colors hover:text-gray-900 hover:decoration-current dark:decoration-gray-600 dark:hover:text-white"
          >
            Watch every lesson on YouTube
          </a>
          .
        </p>
      </div>
    </section>
  );
}
