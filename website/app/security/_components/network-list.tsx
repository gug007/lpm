import Link from "next/link";
import type { ReactNode } from "react";
import { MOBILE_PATH, PRIVACY_PATH, SHARE_TERMINAL_PATH } from "@/lib/links";
import { LINK } from "@/components/prose";

type Connection = { what: string; body: ReactNode };

const CONNECTIONS: Connection[] = [
  {
    what: "Update checks",
    body: "The desktop app asks GitHub's releases API for the latest version at launch and every 24 hours. Updates download from GitHub Releases.",
  },
  {
    what: "AI features",
    body: "Commit messages, Generate with AI and prompt rewrites run through the agent CLI you installed, under your own account. lpm hosts no model.",
  },
  {
    what: "Your other devices",
    body: "Paired computers, servers and phones connect directly. When both sides run a current lpm, the link is encrypted and pinned to each machine's identity.",
  },
  {
    what: "Built-in Tailscale",
    body: "Only if you sign in to Tailscale in lpm. Then it joins your tailnet through Tailscale's servers, under your own Tailscale account.",
  },
  {
    what: "Push alerts",
    body: (
      <>
        Only if you pair{" "}
        <Link href={MOBILE_PATH} className={LINK}>
          a phone
        </Link>
        . Each alert is sealed on your computer with a key only it and your
        phone hold, then relayed through lpm&rsquo;s server to Apple or
        Google. They see that an alert went to your device, never what it
        says.
      </>
    ),
  },
  {
    what: "Shared tabs",
    body: (
      <>
        Only when you{" "}
        <Link href={SHARE_TERMINAL_PATH} className={LINK}>
          share a tab
        </Link>{" "}
        with someone&rsquo;s browser. It joins through lpm&rsquo;s relay,
        encrypted end to end between their browser and your computer.
      </>
    ),
  },
  {
    what: "Crash reports",
    body: "Only if you turn on Send crash reports in Settings. Then an error lpm didn't expect goes to Sentry with your lpm and operating system versions, and never with your code, terminal output or prompts.",
  },
  {
    what: "This website",
    body: (
      <>
        lpm.cx uses Google Analytics to count visits. The apps don&rsquo;t.
        Details are in the{" "}
        <Link href={PRIVACY_PATH} className={LINK}>
          privacy policy
        </Link>
        .
      </>
    ),
  },
];

export function NetworkList() {
  return (
    <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
      {CONNECTIONS.map(({ what, body }) => (
        <div key={what} className="grid gap-1 px-4 py-3.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4 sm:px-5">
          <dt className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {what}
          </dt>
          <dd className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {body}
          </dd>
        </div>
      ))}
    </dl>
  );
}
