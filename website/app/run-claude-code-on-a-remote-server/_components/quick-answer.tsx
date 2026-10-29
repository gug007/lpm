import Link from "next/link";
import { Check, ChevronDown, X } from "lucide-react";
import { CodeBlock } from "@/components/config/code-block";
import { MAC_MINI_PATH, SSH_TERMINAL_MAC_PATH } from "@/lib/links";

const CHECKS: { label: string; tmux: boolean }[] = [
  { label: "Keeps the agent running", tmux: true },
  { label: "Starts the project’s services and shows their ports", tmux: false },
  { label: "Shows the diff the agent just wrote", tmux: false },
  { label: "A badge on your Mac when it needs an answer", tmux: false },
];

const LINK =
  "font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100";

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <Check
      className="h-4 w-4 text-gray-900 dark:text-gray-100"
      strokeWidth={2.5}
      aria-label="Yes"
    />
  ) : (
    <X className="h-4 w-4 text-gray-300 dark:text-gray-600" aria-label="No" />
  );
}

export default function QuickAnswer() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.025]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            The short answer
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            How do you keep Claude Code running after you close your laptop?
          </h2>
          <p className="mt-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            Move the run off the laptop. Put Claude Code or Codex on a Linux
            server and drive it from your Mac: in lpm, click{" "}
            <strong className="font-medium text-gray-900 dark:text-gray-100">
              + → Server → Install lpm there
            </strong>
            , type <code className="font-mono text-[0.9em]">user@host</code>,
            and the server&rsquo;s projects join your sidebar while the work
            stays on the server, lid open or not.
          </p>

          <table className="mt-6 w-full overflow-hidden rounded-xl bg-white text-sm ring-1 ring-gray-200 dark:bg-transparent dark:ring-gray-800">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold text-gray-700 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-300">
                <th className="px-4 py-2.5">
                  <span className="sr-only">What you get</span>
                </th>
                <th className="w-28 whitespace-nowrap px-4 py-2.5 font-mono font-medium sm:w-32">
                  ssh + tmux
                </th>
                <th className="w-16 px-4 py-2.5 sm:w-20">lpm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {CHECKS.map(({ label, tmux }) => (
                <tr key={label}>
                  <td className="px-4 py-2.5 text-gray-700 dark:text-gray-300">
                    {label}
                  </td>
                  <td className="px-4 py-2.5">
                    <Mark yes={tmux} />
                  </td>
                  <td className="px-4 py-2.5">
                    <Mark yes />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <details className="group mt-5">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
              The long answer, with the tmux commands
              <ChevronDown
                className="h-4 w-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-4 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
              <p>
                Claude Code and Codex are command-line tools, so they run
                perfectly well on a Linux box that never sleeps — the hard part
                has never been starting them there, it&rsquo;s everything
                around it.
              </p>
              <CodeBlock filename="The way most people do it">
                ssh user@build-server{"\n"}
                tmux new -s agent{"\n"}
                claude{"\n"}
                {"# detach, reconnect tomorrow, hope it's all still there"}
              </CodeBlock>
              <p>
                That keeps the process alive and gives you back a shell. It
                doesn&rsquo;t give you the project&rsquo;s services, the ports
                they came up on, the diff the agent just wrote, or a badge on
                your Mac the moment it needs an answer.
              </p>
              <p>
                lpm takes the same idea and manages the plumbing. Click{" "}
                <strong className="font-medium text-gray-900 dark:text-gray-100">
                  + → Server → Install lpm there
                </strong>{" "}
                and type{" "}
                <code className="font-mono text-[0.9em]">user@host</code>
                {" — "}lpm installs itself on that server over SSH, pairs the
                two machines without you copying a secret anywhere, and
                forwards the connection so nothing new is exposed. From then on
                the server&rsquo;s projects sit in your Mac sidebar and open in
                the same window as the local ones — while the work itself stays
                on the server, lid open or not.
              </p>
              <p>
                This is a different thing from{" "}
                <Link href={SSH_TERMINAL_MAC_PATH} className={LINK}>
                  reaching a remote box from a Mac terminal
                </Link>
                : here the whole of lpm is running on the Linux machine, and
                your Mac is the window onto it. When one folder is all you need,
                the Server screen&rsquo;s other choice, Just SSH in, opens it as
                an SSH project without installing lpm on the server.
              </p>
              <p>
                No Linux box? Claude Code and Codex can run on{" "}
                <Link href={MAC_MINI_PATH} className={LINK}>
                  a Mac mini you already own
                </Link>
                , paired with your laptop under + → Another computer instead of
                over SSH.
              </p>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}
