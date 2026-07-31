import Link from "next/link";
import { CodeBlock } from "@/components/config/code-block";
import { SSH_TERMINAL_MAC_PATH } from "@/lib/links";

export default function QuickAnswer() {
  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-3xl mx-auto px-6">
        <div className="rounded-2xl border border-gray-200 bg-gray-50/70 p-6 sm:p-8 dark:border-gray-800 dark:bg-white/[0.025]">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
            The short answer
          </p>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
            How do you keep Claude Code running after you close your laptop?
          </h2>
          <div className="mt-4 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            <p>
              You don&rsquo;t. You move the run off the laptop. Claude Code and
              Codex are command-line tools, so they run perfectly well on a
              Linux box that never sleeps — the hard part has never been
              starting them there, it&rsquo;s everything around it.
            </p>
          </div>

          <div className="mt-6">
            <CodeBlock filename="The way most people do it">
              ssh user@build-server{"\n"}
              tmux new -s agent{"\n"}
              claude{"\n"}
              {"# detach, reconnect tomorrow, hope it's all still there"}
            </CodeBlock>
          </div>

          <div className="mt-2 space-y-4 text-sm sm:text-base leading-relaxed text-gray-600 dark:text-gray-400">
            <p>
              That keeps the process alive and gives you back a shell. It
              doesn&rsquo;t give you the project&rsquo;s services, the ports
              they came up on, the diff the agent just wrote, or a badge on your
              Mac the moment it needs an answer.
            </p>
            <p>
              lpm takes the same idea and manages the plumbing. In{" "}
              <strong className="font-medium text-gray-900 dark:text-gray-100">
                Settings → Connections
              </strong>{" "}
              you type <code className="font-mono text-[0.9em]">user@host</code>
              {" — "}lpm installs itself on that server over SSH, pairs the two
              machines without you copying a secret anywhere, and forwards the
              connection so nothing new is exposed. From then on the
              server&rsquo;s projects sit in your Mac sidebar and open in the
              same window as the local ones — while the work itself stays on the
              server, lid open or not.
            </p>
            <p>
              This is a different thing from{" "}
              <Link
                href={SSH_TERMINAL_MAC_PATH}
                className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-gray-100 dark:decoration-gray-700 dark:hover:decoration-gray-100"
              >
                reaching a remote box from a Mac terminal
              </Link>
              : here the whole of lpm is running on the Linux machine, and your
              Mac is the window onto it.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
