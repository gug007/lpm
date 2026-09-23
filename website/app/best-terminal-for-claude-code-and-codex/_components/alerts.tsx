import Link from "next/link";
import { BellRing, PanelTop, Smartphone, Volume2, type LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { MOBILE_PATH } from "@/lib/links";
import { AlertsReplica } from "./alerts-replica";

type Channel = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const CHANNELS: Channel[] = [
  {
    icon: PanelTop,
    title: "On the tab and in the sidebar",
    body: "A tab shimmers while its agent works, pulses amber when it needs you, turns blue when it is done and red on a problem. The same state, with a timer, shows under the project in the sidebar.",
  },
  {
    icon: Volume2,
    title: "A chime you choose",
    body: "A sound plays when an agent finishes, asks for approval, or stops with an error. Pick the built-in chime, a macOS sound, your own file, or silence for each one.",
  },
  {
    icon: BellRing,
    title: "A banner when you are away",
    body: "When no lpm window is in front, macOS shows a banner such as “Agent needs you” or “Agent finished”, naming the tab and project, so you can stay in your browser or editor until it matters.",
  },
  {
    icon: Smartphone,
    title: "A push on your iPhone",
    body: (
      <>
        Pair the{" "}
        <Link
          href={MOBILE_PATH}
          className="font-medium text-gray-700 dark:text-gray-300 underline underline-offset-2 hover:text-gray-900 dark:hover:text-white"
        >
          lpm Link iPhone app
        </Link>{" "}
        and get an encrypted push when an agent needs input, finishes, or
        errors, then open that terminal on your phone and answer it.
      </>
    ),
  },
];

export default function Alerts() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Alerts"
          title="Know the moment Claude Code or Codex needs you"
          description="lpm connects to both agents on its own, so every session reports whether it is working, waiting on you, finished, or hit a problem. No setup, no polling tabs."
          className="mb-12"
        />
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
          <AlertsReplica />
          <ul className="space-y-6">
            {CHANNELS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-white/[0.06] text-gray-700 dark:text-gray-300 ring-1 ring-gray-200 dark:ring-white/[0.06]">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {title}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                    {body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-10 text-center text-xs text-gray-500 dark:text-gray-400 max-w-xl mx-auto leading-relaxed">
          Live status, sounds, and banners cover Claude Code and Codex. Gemini
          CLI and OpenCode run fine in lpm terminals but don&apos;t report their
          state on their own.
        </p>
      </div>
    </section>
  );
}
