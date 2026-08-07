import type { ReactNode } from "react";
import { SectionHeader } from "@/components/section-header";

type Step = {
  n: number;
  title: string;
  body: ReactNode;
};

const STEPS: Step[] = [
  {
    n: 1,
    title: "You type user@build-server",
    body: (
      <>
        The same string you would type after{" "}
        <code className="font-mono text-[0.9em]">ssh</code>, with an optional{" "}
        <code className="font-mono text-[0.9em]">:port</code>. lpm uses your
        existing SSH setup — your keys, your{" "}
        <code className="font-mono text-[0.9em]">~/.ssh/config</code>. If you
        can reach the machine with a key, so can lpm.
      </>
    ),
  },
  {
    n: 2,
    title: "lpm installs itself on the server",
    body: (
      <>
        Over that SSH connection it fetches the published Linux bundle and runs
        its installer: the app, the{" "}
        <code className="font-mono text-[0.9em]">lpm</code> command-line tool,
        and a service that comes back up on boot. On a small server this takes a
        few minutes — most of it the download and the system packages.
      </>
    ),
  },
  {
    n: 3,
    title: "The two machines pair themselves",
    body: (
      <>
        lpm asks the server for a single-use invite and consumes it over its own
        forward. The secret never leaves the SSH channel, never lands on a
        clipboard, and the server keeps only a hash of the token it issued.
      </>
    ),
  },
  {
    n: 4,
    title: "The connection comes up, and stays up",
    body: (
      <>
        The server&rsquo;s port stays bound to the server itself. lpm forwards
        it to your Mac and supervises that forward — if it drops, lpm brings it
        back within seconds, and it tells you when the tunnel is the thing
        that&rsquo;s down rather than blaming the server.
      </>
    ),
  },
  {
    n: 5,
    title: "Its projects show up in your sidebar",
    body: (
      <>
        Under the server&rsquo;s own name, beside your local projects. Open one
        and it is the same project view: the same terminal tabs, the same
        service controls, the same review pane. The only things that stay behind
        are the ones that need an app installed on your Mac.
      </>
    ),
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What happens when you press Connect"
          title="One field, five things you would otherwise do by hand"
        />
        <ol className="space-y-5">
          {STEPS.map(({ n, title, body }) => (
            <li
              key={n}
              className="flex gap-5 rounded-2xl border border-gray-200 p-6 dark:border-gray-800"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-900 text-sm font-semibold text-white dark:bg-white dark:text-gray-900">
                {n}
              </span>
              <div>
                <h3 className="mb-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
          Already have lpm on the server? Untick the install box and lpm just
          pairs with it.
        </p>
      </div>
    </section>
  );
}
