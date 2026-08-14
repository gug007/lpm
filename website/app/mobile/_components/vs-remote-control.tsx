import { SectionHeader } from "@/components/section-header";

type Row = {
  label: string;
  body: string;
};

const ROWS: Row[] = [
  {
    label: "Any agent, not one",
    body: "Claude Code, Codex, Gemini CLI, or whatever else you run in an lpm terminal — they all reach your phone the same way, in the same app.",
  },
  {
    label: "The real session, not a transcript",
    body: "You get the actual terminal from your Mac, opened with its recent scrollback already on screen, and you type into that same session — including the prompts and full-screen views an agent draws.",
  },
  {
    label: "Review and ship, not just prompt",
    body: "Read the diff file by file, commit the files you pick with an AI-written message, pull, push, and — where the GitHub CLI is set up — open the pull request from the phone.",
  },
  {
    label: "The project, not only the agent",
    body: "Start and stop services, start a project under a different profile, run saved actions, and duplicate a project to fan work out — the workspace around the agent comes with it.",
  },
  {
    label: "Straight to your Mac",
    body: "Pair by scanning a QR code from lpm on your Mac. Terminal output and keystrokes travel directly between the two devices, and there is no account to create.",
  },
];

export default function VsRemoteControl() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Alongside the built-in remote control"
          title="Already driving Claude Code from your phone?"
          description="Claude Code ships its own remote control, and it is a good way to keep one agent moving. The lpm companion draws a wider circle around the same idea."
        />
        <dl className="rounded-2xl border border-gray-200 dark:border-gray-800 divide-y divide-gray-200 dark:divide-gray-800 overflow-hidden bg-white dark:bg-transparent">
          {ROWS.map(({ label, body }) => (
            <div
              key={label}
              className="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-1 sm:gap-6 px-5 py-4 sm:px-6"
            >
              <dt className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {label}
              </dt>
              <dd className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {body}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
