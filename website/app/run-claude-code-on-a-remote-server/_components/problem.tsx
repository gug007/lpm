import { BatteryLow, Laptop, PlugZap, Wifi } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const CARDS = [
  {
    icon: Laptop,
    title: "The lid closes and the run ends",
    body: "A refactor across forty files takes the better part of an hour. Meetings, commutes, and school runs are shorter than that. The one machine you cannot leave running is the one you carry.",
  },
  {
    icon: Wifi,
    title: "The network changes and the session goes with it",
    body: "Office Wi-Fi to tethering to home. Every hop drops the connection, and anything attached to it goes down unless you remembered to start a multiplexer first.",
  },
  {
    icon: BatteryLow,
    title: "Three agents is a lot to ask of a laptop",
    body: "Three agent sessions, three dev servers, a browser and your editor. The machine grinding through all of it is the same one you are trying to type on.",
  },
  {
    icon: PlugZap,
    title: "A shell is not a workspace",
    body: "SSH in and you have a prompt. Not which services are up, not which port the API landed on, not what changed on disk, not which of the three agents is waiting on an answer.",
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Why move it off the Mac"
          title="A laptop is the wrong computer for a long agent run"
          description="None of these are new problems. They just got sharper once the thing running in the terminal started taking an hour and doing real work."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {CARDS.map(({ icon: Icon, title, body }) => (
            <article
              key={title}
              className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <Icon
                className="h-5 w-5 text-gray-400 dark:text-gray-500"
                aria-hidden
              />
              <h3 className="mt-4 text-base font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
