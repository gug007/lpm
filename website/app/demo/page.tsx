import type { Metadata } from "next";
import { EmptyDemo } from "./_components/empty-demo";

const TITLE = "Interactive Demo";
const DESCRIPTION =
  "Try lpm in your browser: an empty Mac workspace where you add a project, start its services, and open Claude Code and Codex from the toolbar.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: false, follow: true },
  alternates: {
    canonical: "/demo",
  },
  openGraph: {
    title: `${TITLE} — lpm`,
    description: DESCRIPTION,
    type: "website",
    url: "/demo",
    siteName: "lpm",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} — lpm`,
    description: DESCRIPTION,
  },
};

export default function DemoPage() {
  return (
    <section className="px-4 pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-16 sm:px-6">
      <div className="mx-auto mb-5 max-w-2xl text-center sm:mb-6">
        <h1 className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 bg-clip-text text-2xl font-extrabold leading-[1.1] tracking-tight text-transparent sm:text-3xl dark:from-white dark:via-gray-100 dark:to-gray-400">
          Try lpm in your browser
        </h1>
        <p className="mt-2 text-pretty text-sm leading-relaxed text-gray-600 sm:text-[15px] dark:text-gray-400">
          An empty workspace, like a fresh install. Add a folder, clone a repo,
          or connect an SSH host, then start it and open an agent.
        </p>
      </div>
      <EmptyDemo />
    </section>
  );
}
