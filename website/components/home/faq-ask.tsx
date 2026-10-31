import Link from "next/link";
import { BookOpen, MessagesSquare } from "lucide-react";
import { TelegramIcon } from "@/components/telegram-icon";
import { DISCUSSIONS_URL, DOCS_PATH, TELEGRAM_URL } from "@/lib/links";

const BUTTON =
  "inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors";
const OUTLINE = `${BUTTON} border border-gray-300 bg-white text-gray-800 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:bg-transparent dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white`;

// The questions the list doesn't answer come up here, so the section ends on
// where they get answered.
export function FaqAsk() {
  return (
    <div className="mt-8 flex flex-col items-start gap-4 rounded-2xl border border-gray-200 bg-gray-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-gray-800 dark:bg-white/[0.02]">
      <div>
        <h3 className="text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          Didn&rsquo;t find your question?
        </h3>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
          Ask the maker and other users, or read the docs.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${BUTTON} bg-gray-900 text-white hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100`}
        >
          <TelegramIcon className="h-4 w-4" />
          Ask on Telegram
        </a>
        <a
          href={DISCUSSIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={OUTLINE}
        >
          <MessagesSquare className="h-4 w-4" aria-hidden="true" />
          GitHub Discussions
        </a>
        <Link href={DOCS_PATH} className={OUTLINE}>
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Docs
        </Link>
      </div>
    </div>
  );
}
