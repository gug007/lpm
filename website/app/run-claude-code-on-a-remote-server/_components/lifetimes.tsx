import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const SURVIVES = [
  {
    title: "Closing the lid, quitting lpm, losing Wi-Fi",
    body: "Only the connection goes away. The agents and the services on the server carry on exactly as they were.",
  },
  {
    title: "Restarting your Mac",
    body: "Reopen lpm and it asks the server which sessions are still alive, then adopts them instead of starting new ones. You get the terminal back with its recent output replayed, still attached to the same running agent.",
  },
  {
    title: "Switching to another project",
    body: "Moving around your own sidebar never stops a terminal on the server. You leave, it keeps working.",
  },
  {
    title: "Rebooting the server",
    body: "On a systemd server lpm runs as a service, so it comes back with the machine. Your projects are there; the agent conversations that were running are not. In a container, start it again with lpm-host start.",
  },
  {
    title: "Your Mac being off, for your phone",
    body: "Pair the lpm iPhone app with the server itself and it connects straight there, so you can check on an agent or answer it while your Mac is asleep.",
  },
];

const DOES_NOT = [
  {
    title: "Updating lpm on the server",
    body: "Update and Reinstall restart lpm there, and that ends every agent running on it. lpm says so in the confirmation before it does it. The project's services are not tied to lpm and keep running; an agent conversation does not resume.",
  },
  {
    title: "Older scrollback",
    body: "When you reattach, the server replays the recent tail of each terminal, not its entire history. What scrolled past long ago is gone.",
  },
  {
    title: "A service's port, on your Mac",
    body: "Server projects have no port forwarding of their own. Reaching a dev server from your Mac's browser is still an SSH forward you set up yourself.",
  },
  {
    title: "Mac-only things, on a server project",
    body: "Opening the project in your editor, and anything else that needs an app installed on your Mac, stays Mac-side. Files are the exception: drag one onto a server terminal and lpm uploads it there.",
  },
];

export default function Lifetimes() {
  return (
    <section id="lifetimes" className="scroll-mt-20 py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The honest version"
          title="What keeps running, and what doesn't"
          description="The whole point of moving work to a server is that it outlives your laptop. That is true — with edges worth knowing before you rely on it."
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-6 sm:p-7 dark:border-emerald-900/60 dark:bg-emerald-400/[0.045]">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
              Survives
            </h3>
            <ul className="mt-5 space-y-5">
              {SURVIVES.map(({ title, body }) => (
                <li key={title} className="flex gap-3">
                  <Check
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 p-6 sm:p-7 dark:border-gray-800">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
              Doesn&rsquo;t
            </h3>
            <ul className="mt-5 space-y-5">
              {DOES_NOT.map(({ title, body }) => (
                <li key={title} className="flex gap-3">
                  <X
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-500 dark:text-gray-400"
                    aria-hidden
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {title}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
