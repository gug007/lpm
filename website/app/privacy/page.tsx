import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_PATH, REPO_URL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy policy for lpm — what data the website and software collect, how it's used, and your rights.",
  alternates: {
    canonical: PRIVACY_PATH,
  },
};

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
        Privacy Policy
      </h1>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Last updated: April 17, 2026
      </p>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Summary
        </h2>
        <p>
          lpm is an open-source project. The <strong>software itself</strong>{" "}
          (the CLI and the macOS desktop app) runs entirely on your machine.
          It does not collect, transmit, or share any personal data, telemetry,
          or usage information.
        </p>
        <p>
          This <strong>website</strong> (lpm.cx) uses a small amount of
          third-party analytics to understand traffic. Details below.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          The software (CLI and desktop app)
        </h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>No analytics, tracking, or telemetry.</li>
          <li>No account required. No data is sent to any server we control.</li>
          <li>
            All project configuration and state stays on your local machine.
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

      <div className="mt-12 text-xs text-gray-400 dark:text-gray-500">
        <Link href="/" className="underline hover:text-gray-700 dark:hover:text-gray-300">
          ← Back to home
        </Link>
      </div>
    </article>
  );
}
