import { SectionHeader } from "@/components/section-header";
import { STATUS_AGENT_NAMES } from "@/lib/app-facts";

type Row = {
  label: string;
  remoteControl: string;
  lpmLink: string;
};

// The Remote Control column follows code.claude.com/docs/en/remote-control.
const ROWS: Row[] = [
  {
    label: "Agents",
    remoteControl: "Claude Code",
    lpmLink:
      `Claude Code, Codex, Gemini CLI, or any CLI you run in lpm, with status and alerts for ${STATUS_AGENT_NAMES}`,
  },
  {
    label: "On screen",
    remoteControl: "The conversation, in the Claude app or at claude.ai/code",
    lpmLink:
      "The real terminal, with its scrollback and the full-screen views agents draw",
  },
  {
    label: "Git",
    remoteControl: "A diff pane of your changes",
    lpmLink:
      "Read the diff file by file, commit with an AI-written message, pull, push and open a PR",
  },
  {
    label: "The project",
    remoteControl: "The session, with your local tools and MCP servers",
    lpmLink:
      "Start and stop services, switch profiles, run saved actions, duplicate the project",
  },
  {
    label: "Across machines",
    remoteControl: "Claude Code sessions on machines running Remote Control",
    lpmLink:
      "Agents across every project, automations, plan-limit meters, several Macs and Linux servers",
  },
  {
    label: "Connection",
    remoteControl:
      "Through the Anthropic API, on a Pro, Max, Team or Enterprise plan",
    lpmLink: "Straight to your computer, paired by QR code, no account",
  },
];

const COLUMNS = "sm:grid-cols-[9rem_minmax(0,1fr)_minmax(0,1.25fr)]";
const HEAD = "px-5 py-3 text-xs font-semibold sm:px-6";

export default function VsRemoteControl() {
  return (
    <section className="py-20 sm:py-24 bg-gray-50/60 dark:bg-white/[0.02]">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="Alongside the built-in remote control"
          title="Already driving Claude Code from your phone?"
          description="Claude Code ships its own remote control, and it is a good way to keep one agent moving. The lpm companion draws a wider circle around the same idea."
        />
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-transparent">
          <div
            aria-hidden="true"
            className={`hidden border-b border-gray-200 bg-gray-50 sm:grid dark:border-gray-800 dark:bg-white/[0.03] ${COLUMNS}`}
          >
            <div />
            <div className={`${HEAD} text-gray-500 dark:text-gray-400`}>
              Claude Code remote control
            </div>
            <div className={`${HEAD} text-gray-900 dark:text-gray-100`}>
              lpm Link
            </div>
          </div>
          <dl className="divide-y divide-gray-200 dark:divide-gray-800">
            {ROWS.map(({ label, remoteControl, lpmLink }) => (
              <div
                key={label}
                className={`grid gap-1 px-5 py-4 sm:gap-0 sm:px-0 sm:py-0 ${COLUMNS}`}
              >
                <dt className="text-sm font-semibold text-gray-900 sm:px-6 sm:py-4 dark:text-gray-100">
                  {label}
                </dt>
                <dd className="text-sm leading-relaxed text-gray-500 sm:px-6 sm:py-4 dark:text-gray-400">
                  <span className="text-xs font-medium text-gray-500 sm:sr-only dark:text-gray-400">
                    Claude Code remote control:{" "}
                  </span>
                  {remoteControl}
                </dd>
                <dd className="text-sm leading-relaxed text-gray-900 sm:bg-gray-50/70 sm:px-6 sm:py-4 dark:text-gray-100 sm:dark:bg-white/[0.03]">
                  <span className="text-xs font-medium text-gray-500 sm:sr-only dark:text-gray-400">
                    lpm Link:{" "}
                  </span>
                  {lpmLink}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
