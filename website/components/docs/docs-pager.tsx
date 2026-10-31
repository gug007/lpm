import Link from "next/link";
import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import { docsNeighbors, findDocsPage } from "@/lib/docs-pages";
import { REPO_URL } from "@/lib/links";

const CARD =
  "group flex min-w-0 flex-1 flex-col rounded-xl border border-gray-200 px-4 py-3 transition-colors hover:border-gray-300 hover:bg-gray-50/60 dark:border-gray-800 dark:hover:border-gray-700 dark:hover:bg-white/[0.02]";
const LABEL = "text-[12px] text-gray-500 dark:text-gray-400";
const TITLE =
  "mt-0.5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100";

export function DocsPager({ slug }: { slug: string }) {
  const page = findDocsPage(slug);
  const { previous, next } = docsNeighbors(slug);
  if (!page) return null;

  return (
    <footer className="mt-16 border-t border-gray-200 pt-6 dark:border-gray-800">
      <nav aria-label="Previous and next page" className="flex flex-col gap-3 sm:flex-row">
        {previous && (
          <Link href={previous.href} className={CARD}>
            <span className={LABEL}>Previous</span>
            <span className={TITLE}>
              <ArrowLeft
                className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
                aria-hidden
              />
              {previous.title}
            </span>
          </Link>
        )}
        {next && (
          <Link href={next.href} className={`${CARD} sm:items-end sm:text-right`}>
            <span className={LABEL}>Next</span>
            <span className={TITLE}>
              {next.title}
              <ArrowRight
                className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </span>
          </Link>
        )}
      </nav>
      <a
        href={`${REPO_URL}/edit/main/website/${page.source}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex min-h-11 items-center gap-1.5 text-[13px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit this page on GitHub
      </a>
    </footer>
  );
}
