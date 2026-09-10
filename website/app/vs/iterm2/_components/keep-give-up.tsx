import { Check, X } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const KEEP = [
  "Search inside any pane",
  "10,000 lines of scrollback in every pane",
  "Clickable links",
  "Eight terminal themes including one-dark, dracula, nord and solarized-dark",
  "A font size you zoom with ⌘+ and ⌘−",
  "Splits and tabs",
  "Full Unicode",
  "Copy that works from a remote shell",
];

const GIVE_UP = [
  "Triggers that fire on output",
  "Smart selection",
  "The Python scripting API",
  "tmux control mode rendered as native tabs",
  "Scrollback you can set as high as you like, or leave unlimited",
  "Every keybinding and profile you have tuned in iTerm2 — those do not transfer",
];

export function KeepGiveUp() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="The real question"
          title="What you keep, and what you give up"
          description="The day you stop opening iTerm2 first, here is the exact trade."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-6 dark:border-gray-800 dark:bg-white/[0.03]">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-900 dark:text-gray-100">
              What you keep
            </h3>
            <ul className="mt-4 space-y-2.5">
              {KEEP.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-700 dark:text-gray-300"
                >
                  <Check
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-gray-900 dark:text-white"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-gray-200 p-6 dark:border-gray-800">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-gray-900 dark:text-gray-100">
              What you give up
            </h3>
            <ul className="mt-4 space-y-2.5">
              {GIVE_UP.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-400"
                >
                  <X
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-6 text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Which is why the recommendation on this page is “both”, not “switch”.
          lpm owns the project; iTerm2 stays the scratch shell.
        </p>
      </div>
    </section>
  );
}
