import { Check, Minus } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

type AlternativeKey =
  | "lpm"
  | "dedicatedClient"
  | "generalTerminal"
  | "openssh"
  | "editorRemote";

type Capability = {
  label: string;
  note: string;
} & Record<AlternativeKey, boolean>;

const ALTERNATIVES: { key: AlternativeKey; label: string }[] = [
  { key: "lpm", label: "lpm" },
  { key: "dedicatedClient", label: "Dedicated SSH client" },
  { key: "generalTerminal", label: "Terminal running raw ssh" },
  { key: "openssh", label: "raw OpenSSH" },
  { key: "editorRemote", label: "Editor Remote-SSH" },
];

const CAPABILITIES: Capability[] = [
  {
    label: "Reads ~/.ssh/config hosts without replacing OpenSSH",
    note: "lpm uses the selected Host alias when it connects, so OpenSSH remains responsible for options like HostName, ProxyJump, ProxyCommand, Port, and IdentityFile.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: true,
    openssh: true,
    editorRemote: true,
  },
  {
    label: "Remote services run as project panes beside local services",
    note: "This is the lpm project model: services, actions, terminals, and SSH settings live together instead of being separate saved sessions.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Declared remote service ports auto-forward after detection",
    note: "lpm watches remote listening ports for SSH projects and auto-forwards ports declared in the project's services config.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Manual forwards wait for localhost readiness",
    note: "When you add a forward, lpm waits until the local listener accepts a TCP connection before reporting success.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Project stop cleans up the SSH forwards it started",
    note: "Forwards are owned by the lpm project lifecycle, not by whichever tab happened to run an ssh command.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
  {
    label: "Run local tools against a remote tree with mode: sync",
    note: "lpm can rsync ssh.dir into a local mirror, run a local action, then push changes back to the remote host.",
    lpm: true,
    dedicatedClient: false,
    generalTerminal: false,
    openssh: false,
    editorRemote: false,
  },
];

function Indicator({ on }: { on: boolean }) {
  return on ? (
    <Check
      aria-label="Yes"
      className="mx-auto w-4 h-4 text-gray-900 dark:text-white"
    />
  ) : (
    <Minus
      aria-label="Not built in"
      className="mx-auto w-4 h-4 text-gray-300 dark:text-gray-600"
    />
  );
}

export default function Comparison() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-4xl mx-auto px-6">
        <SectionHeader
          eyebrow="How it compares"
          title="lpm vs dedicated SSH clients, Mac terminals, raw OpenSSH, and editor remotes"
          description="The distinction is not whether the other tools can SSH or forward ports. Many can. lpm is different because SSH is part of the project lifecycle: services, actions, panes, and forwards are managed together."
        />

        <div className="hidden sm:block rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50/60 dark:bg-white/[0.02] border-b border-gray-200 dark:border-gray-800">
                <th
                  scope="col"
                  className="text-left font-medium text-gray-500 dark:text-gray-400 px-5 py-4 w-2/5"
                >
                  Capability
                </th>
                {ALTERNATIVES.map((a) => (
                  <th
                    key={a.key}
                    scope="col"
                    className={`text-center font-semibold px-3 py-4 ${
                      a.key === "lpm"
                        ? "text-gray-900 dark:text-white bg-gray-100/70 dark:bg-white/[0.04]"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {a.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((cap, i) => (
                <tr
                  key={cap.label}
                  className={
                    i !== CAPABILITIES.length - 1
                      ? "border-b border-gray-200 dark:border-gray-800"
                      : ""
                  }
                >
                  <th
                    scope="row"
                    className="text-left font-normal text-gray-700 dark:text-gray-300 px-5 py-4"
                  >
                    <span>{cap.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-gray-400 dark:text-gray-500">
                      {cap.note}
                    </span>
                  </th>
                  {ALTERNATIVES.map((a) => (
                    <td
                      key={a.key}
                      className={`px-3 py-4 align-top ${
                        a.key === "lpm"
                          ? "bg-gray-100/70 dark:bg-white/[0.04]"
                          : ""
                      }`}
                    >
                      <Indicator on={cap[a.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sm:hidden space-y-4">
          {ALTERNATIVES.map((a) => {
            const isLpm = a.key === "lpm";
            return (
              <div
                key={a.key}
                className={`rounded-2xl border p-5 ${
                  isLpm
                    ? "border-gray-300 dark:border-gray-700 bg-gray-50/60 dark:bg-white/[0.04]"
                    : "border-gray-200 dark:border-gray-800"
                }`}
              >
                <h3
                  className={`text-sm font-semibold mb-4 ${
                    isLpm
                      ? "text-gray-900 dark:text-white"
                      : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {a.label}
                </h3>
                <ul className="space-y-3">
                  {CAPABILITIES.map((cap) => (
                    <li
                      key={cap.label}
                      className="flex items-start gap-3 text-sm"
                    >
                      <span className="mt-0.5 shrink-0">
                        <Indicator on={cap[a.key]} />
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 leading-relaxed">
                        {cap.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
