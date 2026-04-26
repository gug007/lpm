import type { Metadata } from "next";
import Link from "next/link";
import { REPO_URL, TERMS_PATH } from "@/lib/links";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of service for lpm — how you may use the software and website.",
  alternates: {
    canonical: TERMS_PATH,
  },
};

export default function TermsPage() {
  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
        Terms of Service
      </h1>
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
        Last updated: April 17, 2026
      </p>

      <section className="mt-10 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Acceptance
        </h2>
        <p>
          By downloading, installing, or using lpm (the &ldquo;Software&rdquo;)
          or visiting lpm.cx (the &ldquo;Site&rdquo;), you agree to these
          terms. If you don&rsquo;t agree, don&rsquo;t use lpm.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          The Software is free and open source
        </h2>
        <p>
          lpm is distributed free of charge. Source code is available at{" "}
          <a
            href={REPO_URL}
            className="underline hover:text-gray-900 dark:hover:text-gray-100"
          >
            github.com/gug007/lpm
          </a>
          . Your use of the source code is governed by the license in that
          repository.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Acceptable use
        </h2>
        <p>You agree not to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Use lpm to break the law or to violate another party&rsquo;s
            rights.
          </li>
          <li>
            Redistribute the Software in a way that falsely claims endorsement
            by, or affiliation with, the authors.
          </li>
          <li>
            Bundle lpm with malware, adware, or other deceptive software.
          </li>
          <li>
            Reverse engineer the Site itself in order to disrupt it or other
            users.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          No warranty
        </h2>
        <p>
          The Software and Site are provided &ldquo;AS IS&rdquo;, without
          warranty of any kind, express or implied, including but not limited
          to the warranties of merchantability, fitness for a particular
          purpose, and non-infringement. Use at your own risk.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Limitation of liability
        </h2>
        <p>
          In no event shall the authors or copyright holders be liable for any
          claim, damages, or other liability, whether in an action of
          contract, tort, or otherwise, arising from, out of, or in connection
          with the Software or Site, or the use or other dealings in the
          Software or Site.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Third-party services
        </h2>
        <p>
          The Site uses Google Analytics and Google Ads. See the{" "}
          <Link
            href="/privacy"
            className="underline hover:text-gray-900 dark:hover:text-gray-100"
          >
            Privacy Policy
          </Link>{" "}
          for details.
        </p>
      </section>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Changes
        </h2>
        <p>
          We may update these terms. If we do, the &ldquo;last updated&rdquo;
          date at the top of the page will change. Continued use of lpm after
          changes means you accept the updated terms.
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
