import { SectionHeader } from "@/components/section-header";

const ROWS = [
  {
    label: "Plugged in and awake",
    body: "In lpm, click + above your projects and choose Another computer. With Allow control on, open Port 8766 · keep awake and turn on Keep this Mac awake: lpm then keeps the Mac mini from sleeping while it's plugged in and Allow control stays on. Or stop it sleeping in macOS: in System Settings → Energy, turn on Prevent your Mac from automatically sleeping when the display is off.",
  },
  {
    label: "Open lpm at login",
    body: "lpm doesn't launch itself at login. Add it in System Settings → General → Login Items & Extensions, under Open at Login, so it opens again after a restart. Login items open once someone logs in, so a Mac mini that restarted waits at the login window until you sign in, unless automatic login is on (automatic login needs FileVault off).",
  },
  {
    label: "Back after a power cut",
    body: "In System Settings → Energy, turn on Start up automatically after a power failure. With lpm in Login Items, the Mac mini comes back and opens lpm once you log in, or on its own if automatic login is on, which needs FileVault off. Claude Code and Codex sessions that were running stopped mid-task; their tabs resume the conversations when you open the project again.",
  },
  {
    label: "Close the window, don't quit",
    body: "Closing lpm's window on the Mac mini only hides it, and Claude Code and Codex keep working. Quitting lpm there ends their tabs mid-task. The project's services keep running either way.",
  },
  {
    label: "Update between runs",
    body: "Updating lpm on the Mac mini, from its own Update button or from your laptop, restarts lpm there, and that stops its Claude Code and Codex tabs the same way a quit does.",
  },
  {
    label: "Its own tools",
    body: "Install Claude Code, Codex and your toolchain on the Mac mini and sign in there once. lpm sets itself up, not your stack.",
  },
];

export default function Setup() {
  return (
    <section
      id="setup"
      className="scroll-mt-20 py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]"
    >
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The honest version"
          title="Set up the Mac mini once"
          description="Claude Code and Codex keep working on the Mac mini only while it is awake and lpm is open there. A few settings make that the normal state."
        />
        <dl className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-transparent">
          {ROWS.map(({ label, body }) => (
            <div key={label} className="p-5 sm:flex sm:gap-6 sm:p-6">
              <dt className="text-sm font-semibold text-gray-900 sm:w-44 sm:flex-shrink-0 dark:text-gray-100">
                {label}
              </dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-gray-600 sm:mt-0 dark:text-gray-400">
                {body}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          If the Mac mini does fall asleep, Claude Code and Codex pause with
          everything else on it until it wakes, and your laptop shows the Mac
          mini as Not responding.
        </p>
      </div>
    </section>
  );
}
