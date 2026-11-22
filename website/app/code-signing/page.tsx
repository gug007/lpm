import type { Metadata } from "next";
import Link from "next/link";
import { DocsHeading } from "@/components/docs/docs-heading";
import { CODE, LINK, P } from "@/components/prose";
import {
  CODE_SIGNING_PATH,
  PRIVACY_PATH,
  REPO_SLUG,
  REPO_URL,
  SECURITY_PATH,
} from "@/lib/links";
import {
  breadcrumbJsonLd,
  jsonLdString,
  webPageJsonLd,
} from "@/lib/structured-data";

const TITLE = "Code Signing Policy";
const DESCRIPTION =
  "How the lpm installer for Windows is code-signed: who signs it, what gets signed, who may change the code and approve a release, and what the app sends.";

const RELEASE_WORKFLOW_URL = `${REPO_URL}/blob/main/.github/workflows/release.yml`;
const OWNER_URL = `https://github.com/${REPO_SLUG.split("/")[0]}`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CODE_SIGNING_PATH },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CODE_SIGNING_PATH,
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

const structuredData = [
  webPageJsonLd({ title: TITLE, description: DESCRIPTION, path: CODE_SIGNING_PATH }),
  breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Security", path: SECURITY_PATH },
    { name: TITLE, path: CODE_SIGNING_PATH },
  ]),
];

export default function CodeSigningPage() {
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
        Code signing policy
      </h1>
      <p className="mt-4 mb-8 text-pretty text-[15px] leading-relaxed text-gray-600 dark:text-gray-400">
        A signed installer lets Windows show where it comes from and that
        nobody changed it on the way. The Mac builds are signed separately,
        with Apple Developer ID N7S7ZCZ5P7; the{" "}
        <Link href={SECURITY_PATH} className={LINK}>
          security page
        </Link>{" "}
        covers both and how to check a download yourself.
      </p>

      <DocsHeading id="signer">Who signs it</DocsHeading>
      <p className={P}>
        Free code signing provided by{" "}
        <a href="https://about.signpath.io" className={LINK}>
          SignPath.io
        </a>
        , certificate by{" "}
        <a href="https://signpath.org" className={LINK}>
          SignPath Foundation
        </a>
        .
      </p>
      <p className={`mt-3 ${P}`}>
        A Windows installer signed under this policy names SignPath Foundation
        as its publisher.
      </p>

      <DocsHeading id="what">What gets signed</DocsHeading>
      <p className={P}>
        Only the Windows installer of a{" "}
        <a href={`${REPO_URL}/releases`} className={LINK}>
          GitHub release
        </a>
        , <code className={CODE}>lpm-desktop-windows-amd64-setup.exe</code>.
        GitHub Actions builds it from the release&rsquo;s tagged commit in the{" "}
        <a href={RELEASE_WORKFLOW_URL} className={LINK}>
          public release workflow
        </a>
        , and SignPath checks that the file came from that run before signing
        it. Nothing built anywhere else, and no other project&rsquo;s program,
        is signed.
      </p>

      <DocsHeading id="roles">Team roles</DocsHeading>
      <ul className={`list-disc space-y-2 pl-5 ${P}`}>
        <li>
          Committers and reviewers: the{" "}
          <a href={OWNER_URL} className={LINK}>
            owner of {REPO_SLUG}
          </a>
          . Changes from anyone else arrive as pull requests, which are
          reviewed before they&rsquo;re merged.
        </li>
        <li>
          Approvers: the{" "}
          <a href={OWNER_URL} className={LINK}>
            owner of {REPO_SLUG}
          </a>
          , who approves each release&rsquo;s signing request by hand.
        </li>
      </ul>
      <p className={`mt-3 ${P}`}>
        Every account that can change the code or approve signing uses
        two-factor authentication on GitHub and SignPath.
      </p>

      <DocsHeading id="privacy">Privacy</DocsHeading>
      <p className={P}>
        The desktop app sends a daily usage count, which carries no ID, and
        crash reports, which leave out your code, prompts and project names.
        You can turn both off in Settings, and the Windows installer asks
        before either is sent. The app also checks GitHub for new versions.
        The{" "}
        <Link href={PRIVACY_PATH} className={LINK}>
          privacy policy
        </Link>{" "}
        lists everything the apps send and where.
      </p>
    </article>
  );
}
