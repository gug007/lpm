import { CommandBlock } from "@/components/command-block";
import { SectionHeader } from "@/components/section-header";

type Step = { label: string; command: string };

const SYSTEMS: { name: string; note: string; steps: Step[] }[] = [
  {
    name: "macOS and Linux",
    note: "Swap 3000 for your port. A process you started yourself needs no sudo.",
    steps: [
      { label: "See what holds the port, and its PID", command: "lsof -nP -iTCP:3000 -sTCP:LISTEN" },
      { label: "Ask it to stop", command: "kill $(lsof -t -iTCP:3000 -sTCP:LISTEN)" },
      { label: "Still there? Force it", command: "kill -9 $(lsof -t -iTCP:3000 -sTCP:LISTEN)" },
    ],
  },
  {
    name: "Linux without lsof",
    note: "ss ships with most distributions, fuser with psmisc.",
    steps: [
      { label: "See what holds the port", command: "ss -ltnp 'sport = :3000'" },
      { label: "Stop it", command: "fuser -k 3000/tcp" },
    ],
  },
  {
    name: "Windows (PowerShell)",
    note: "In Command Prompt: netstat -ano | findstr :3000, then taskkill /PID <pid> /F.",
    steps: [
      {
        label: "See which process holds the port",
        command: "Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess",
      },
      {
        label: "Stop it",
        command:
          "Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000 -State Listen).OwningProcess",
      },
    ],
  },
];

export default function Fix() {
  return (
    <section className="py-14 sm:py-16">
      <div className="mx-auto max-w-3xl px-6">
        <SectionHeader
          eyebrow="The fix"
          title="Find what holds the port, then stop it"
          description="Read what the first command prints before you stop anything: it might be a database or another app you want to keep."
        />
        <div className="space-y-6">
          {SYSTEMS.map(({ name, note, steps }) => (
            <div
              key={name}
              className="rounded-2xl border border-gray-200 p-5 dark:border-gray-800"
            >
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {name}
              </h3>
              <ol className="mt-3 space-y-3">
                {steps.map(({ label, command }, i) => (
                  <li key={command}>
                    <p className="mb-1.5 text-sm text-gray-600 dark:text-gray-400">
                      {i + 1}. {label}
                    </p>
                    <CommandBlock>{command}</CommandBlock>
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[13px] text-gray-500 dark:text-gray-400">{note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
