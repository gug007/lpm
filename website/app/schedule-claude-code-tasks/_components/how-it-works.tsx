import { SectionHeader } from "@/components/section-header";

const STEPS = [
  {
    number: "01",
    title: "Write the job",
    body: "Name it, then write a prompt, a shell command, or pick one of the project's actions. For a prompt, choose the agent, model, effort and access.",
  },
  {
    number: "02",
    title: "Pick when it runs",
    body: "Every day, on certain days, on an interval, or only when you start it. The editor spells out the schedule in plain English as you go.",
  },
  {
    number: "03",
    title: "It runs on its own",
    body: "When the job is due, lpm runs your optional check for work, makes a fresh copy or worktree if you asked for one, runs the job, then checks the result if you told it how.",
  },
  {
    number: "04",
    title: "Read and reply",
    body: "New results wait in Automations with an unread badge. Open a run to see the full answer, and reply to an AI job to keep the conversation going.",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="How it works"
          title="Set it up once. Check in when it's done."
          description="Automations live in the desktop app, next to the projects they run in."
          className="mb-12"
        />
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.number} className="border-t border-gray-200 pt-6 dark:border-gray-800">
              <span className="font-mono text-xs font-semibold text-gray-500 dark:text-gray-400">
                {step.number}
              </span>
              <h3 className="mt-3 text-base font-semibold text-gray-900 dark:text-gray-100">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
