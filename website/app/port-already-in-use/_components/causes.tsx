import { SectionHeader } from "@/components/section-header";

const CAUSES = [
  {
    title: "The same server, still running",
    body: "You started it in a terminal tab you forgot, or closed the window and the process lived on. It's the most common case.",
  },
  {
    title: "A crash that left a child behind",
    body: "A watcher or bundler crashed, but a worker it started kept the port open.",
  },
  {
    title: "Two projects with the same default",
    body: "Next.js, Rails and Express all start on 3000, Vite on 5173 and Django on 8000, so two projects collide as soon as both run.",
  },
  {
    title: "A container mapping the port",
    body: "A Docker Compose service publishes the same port on your machine. docker ps shows it in the PORTS column.",
  },
  {
    title: "macOS AirPlay Receiver",
    body: "On recent macOS it listens on ports 5000 and 7000, the defaults for Flask and some others. Turn it off under System Settings → General → AirDrop & Handoff.",
  },
];

export default function Causes() {
  return (
    <section className="py-14 sm:py-16">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader eyebrow="Why" title="Why the port is taken" />
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CAUSES.map(({ title, body }) => (
            <li
              key={title}
              className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
