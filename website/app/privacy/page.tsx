import type { Metadata } from "next";
import Link from "next/link";
import { MOBILE_PATH, PRIVACY_PATH, REPO_URL } from "@/lib/links";

const DESCRIPTION =
  "Privacy policy for lpm: what the Mac app, the lpm Link iPhone app, and the lpm.cx website collect, how optional push notifications work, and your rights.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: DESCRIPTION,
  alternates: {
    canonical: PRIVACY_PATH,
  },
  openGraph: {
    title: "Privacy Policy",
    description: DESCRIPTION,
    type: "website",
    url: PRIVACY_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: "Privacy Policy",
    description: DESCRIPTION,
  },
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-28 pb-16 sm:pt-32 sm:pb-20">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
        Privacy Policy
      </h1>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
        Last updated: September 23, 2026
      </p>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Summary
        </h2>
        <p>
          lpm is an open-source project. The <strong>software itself</strong>{" "}
          (the macOS desktop app and the lpm Link iOS app) runs on your own
          machines. It does not collect, transmit, or share any personal data,
          telemetry, or usage information. Two things reach the network on
          their own: the desktop app&rsquo;s update check and, if you pair an
          iPhone, push notifications. Both are described below.
        </p>
        <p>
          This <strong>website</strong> (lpm.cx) uses a small amount of
          third-party analytics to understand traffic. Details below.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          The software (desktop app)
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>No analytics, tracking, or telemetry.</li>
          <li>No account required.</li>
          <li>
            All project configuration and state stays on your local machine.
          </li>
          <li>
            <strong>Update checks</strong>: the Mac app asks GitHub&rsquo;s
            releases API for the latest version at launch and every 24 hours.
            Updates, and the lpm build a Linux server installs when you add it
            as a host, download from GitHub Releases.
          </li>
          <li>
            <strong>AI features</strong> (commit and pull request text,
            Generate with AI, prompt rewrites) run through the agent CLI you
            installed, under your own account, so that provider receives what
            you send it. lpm hosts no model of its own.
          </li>
          <li>
            <strong>Push notifications</strong> are sent only if you pair an{" "}
            <Link
              href={MOBILE_PATH}
              className="underline hover:text-gray-900 dark:hover:text-gray-100"
            >
              iPhone
            </Link>
            . Apple requires a signing key to deliver them, so those
            notifications are relayed through a server we run. The contents are
            sealed on your Mac (or the Linux server your phone is paired with)
            and can only be opened by your iPhone — we can see that a
            notification was relayed and to which device, never what it says.
            Terminal output, keystrokes, diffs, and files go straight from your
            Mac to your phone.
          </li>
          <li>
            Source code is available at{" "}
            <a
              href={REPO_URL}
              className="underline hover:text-gray-900 dark:hover:text-gray-100"
            >
              github.com/gug007/lpm
            </a>{" "}
            so you can verify this for yourself.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          The iOS app (lpm Link)
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>No analytics, tracking, or telemetry. No data is collected.</li>
          <li>
            The app talks only to the machines you pair it with, meaning your
            Mac or a Linux server running lpm, over whatever route reaches them
            (your home network, Tailscale, or an address you enter). Nothing is
            sent to any server we control.
          </li>
          <li>
            Camera access is used to scan the pairing QR code and, when you tap
            Take Photo, to attach a photo to a prompt or a project note. Photos
            go only to the Mac or server you paired with.
          </li>
          <li>
            The pairing credential is stored in the iOS Keychain on your device.
          </li>
          <li>No account is required.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Website analytics
        </h2>
        <p>
          lpm.cx uses the following third-party services to understand website
          traffic and measure ad performance:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Google Analytics</strong> — aggregated visitor statistics
            (pages visited, referrer, approximate location, device type).
          </li>
          <li>
            <strong>Google Ads</strong> — conversion measurement for ads that
            link to the site.
          </li>
        </ul>
        <p>
          These services may set cookies in your browser. You can opt out by
          using browser settings, an ad blocker, or the{" "}
          <a
            href="https://tools.google.com/dlpage/gaoptout"
            className="underline hover:text-gray-900 dark:hover:text-gray-100"
            rel="noopener noreferrer"
            target="_blank"
          >
            Google Analytics opt-out add-on
          </a>
          .
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          What we don&rsquo;t do
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>We don&rsquo;t sell your data.</li>
          <li>We don&rsquo;t bundle third-party software with the installer.</li>
          <li>We don&rsquo;t run ads inside the software.</li>
          <li>We don&rsquo;t require an account to use lpm.</li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Your rights
        </h2>
        <p>
          Because the software stores no personal data on our side, there is
          nothing for us to export, correct, or delete. For website analytics
          data handled by Google, see Google&rsquo;s privacy policy and
          opt-out tools linked above.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Changes
        </h2>
        <p>
          If this policy changes, the &ldquo;last updated&rdquo; date at the
          top of the page will change with it.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Contact
        </h2>
        <p>
          Questions? Open an issue at{" "}
          <a
            href={`${REPO_URL}/issues`}
            className="underline hover:text-gray-900 dark:hover:text-gray-100"
          >
            github.com/gug007/lpm/issues
          </a>
          .
        </p>
      </section>

      <div className="mt-12 text-xs text-gray-500 dark:text-gray-400">
        <Link href="/" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          ← Back to home
        </Link>
      </div>
    </article>
  );
}
