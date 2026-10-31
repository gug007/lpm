import type { Metadata } from "next";
import { DocsHeading } from "@/components/docs/docs-heading";
import { CODE, LINK, P } from "@/components/prose";
import { RemoveLpm } from "@/components/remove-lpm";
import { REPO_URL, SECURITY_PATH, SECURITY_REPORT_URL } from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";
import { NetworkList } from "./_components/network-list";
import { SecurityStatus } from "./_components/security-status";
import { VerifyDownloads } from "./_components/verify-downloads";

const TITLE = "Security — What lpm Installs, Signs and Sends";
const DESCRIPTION =
  "How lpm builds are made and signed, how to check a download's checksum and notarization, what the app changes on your computer, what it sends over the network, and how to report a vulnerability.";

const RELEASE_WORKFLOW_URL = `${REPO_URL}/blob/main/.github/workflows/release.yml`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: SECURITY_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: SECURITY_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({ title: TITLE, description: DESCRIPTION, path: SECURITY_PATH }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Security", path: SECURITY_PATH },
  ]),
];

export default function SecurityPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 pt-28 pb-20 sm:pt-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(structuredData) }}
      />
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        Security
      </p>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight sm:text-4xl">
        What lpm installs, signs and sends
      </h1>
      <p className="mt-4 mb-8 text-pretty text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
        lpm is open source, and every build comes from a public GitHub
        workflow. This page is the one to send whoever has to approve it: how
        to check a download, what the app changes on a computer, what it
        sends over the network, and how to report a problem.
      </p>

      <SecurityStatus />

      <DocsHeading id="builds">Where the builds come from</DocsHeading>
      <p className={P}>
        Each release is built by GitHub Actions from its tagged commit, in the{" "}
        <a href={RELEASE_WORKFLOW_URL} className={LINK}>
          public release workflow
        </a>
        , and published as a{" "}
        <a href={`${REPO_URL}/releases`} className={LINK}>
          GitHub release
        </a>
        . The Mac builds are signed with Apple Developer ID N7S7ZCZ5P7, then
        notarized by Apple and stapled, so Gatekeeper opens them. The Windows
        installer and the Linux packages aren&rsquo;t code-signed yet, so
        SmartScreen can warn about the installer, and the checksum is how you
        confirm the file.
      </p>

      <DocsHeading id="verify">Check a download</DocsHeading>
      <VerifyDownloads />

      <DocsHeading id="on-your-computer">What lpm changes on your computer</DocsHeading>
      <p className={P}>
        lpm runs only the commands you configure, as your own user. It keeps
        its settings and project config in <code className={CODE}>~/.lpm</code>
        , with project notes encrypted on disk. To show what each agent is
        doing, it adds status hooks for Claude Code, Codex, Gemini CLI and
        Cursor CLI. Installing Agent tools adds the{" "}
        <code className={CODE}>lpm</code> command and the lpm skills for your
        agents.
      </p>
      <h3 className="mt-6 text-[15px] font-semibold text-gray-900 dark:text-white">
        Removing all of it
      </h3>
      <div className={`mt-2 ${P}`}>
        <RemoveLpm />
      </div>

      <DocsHeading id="network">What leaves your computer</DocsHeading>
      <p className={`mb-4 ${P}`}>
        Nothing that lets lpm read your code. These are the only connections
        the apps make:
      </p>
      <NetworkList />

      <DocsHeading id="report">Report a vulnerability</DocsHeading>
      <p className={P}>
        Please report it privately, not in a public issue:{" "}
        <a href={SECURITY_REPORT_URL} className={LINK}>
          open a private security advisory on GitHub
        </a>
        . Include what you found, how to reproduce it, and the lpm version
        (Settings &rarr; About, or{" "}
        <code className={CODE}>lpm --version</code>). The fix ships in a
        release, with credit to you if you&rsquo;d like it.
      </p>
    </article>
  );
}
