import Image from "next/image";
import { SectionHeader } from "@/components/section-header";

type Step = {
  n: number;
  title: string;
  body: React.ReactNode;
  src: string;
  alt: string;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: "Add a new project",
    body: (
      <>
        Click <strong>+</strong> in the sidebar, browse to a directory, and
        define your services in the built-in editor. Hit Save and the project
        appears in the sidebar ready to start.
      </>
    ),
    src: "/screenrecording/add-project.gif",
    alt: "Adding a new project in lpm desktop app",
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
    src: "/screenrecording/start-project.gif",
    alt: "Starting a project in lpm desktop app",
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
    src: "/screenrecording/add-action.gif",
    alt: "Adding an action to a project in lpm desktop app",
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
    src: "/screenrecording/run-profile-project.gif",
    alt: "Running a project with multiple profiles in lpm desktop app",
  },
];

export function HowItWorks() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader eyebrow="How it works" title="See it in action" />

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
              <Image
                src={step.src}
                alt={step.alt}
                width={1200}
                height={750}
                unoptimized
                className="w-full h-auto rounded-lg shadow-2xl shadow-gray-200/60 dark:shadow-black/40"
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
