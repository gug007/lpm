"use client";

import { ArrowDownToLine } from "lucide-react";
import type { ReactNode } from "react";
import { isMobilePlatform, usePlatform } from "@/lib/use-platform";
import { TELEGRAM_URL } from "@/lib/links";
import { DownloadLink } from "./download-link";
import { SendLinkButton } from "./home/send-link-button";
import { TelegramIcon } from "./telegram-icon";

const PRIMARY =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-gray-900 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100";

// The menu ends on the one step that gets lpm installed: a phone can't run
// it, so there it sends the link on to a computer; a narrow desktop window
// gets the download itself.
export function NavMobileGet({ github }: { github: ReactNode }) {
  const platform = usePlatform();

  return (
    <div className="mt-2 border-t border-gray-200/70 pt-4 pb-2 dark:border-gray-800/70">
      {isMobilePlatform(platform) ? (
        <SendLinkButton variant="menu" label="Send lpm to my computer" />
      ) : (
        <DownloadLink className={PRIMARY}>
          <ArrowDownToLine className="h-4 w-4" aria-hidden />
          Download lpm
        </DownloadLink>
      )}
      <div className="mt-3 flex items-center justify-center gap-4">
        {github}
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-1.5 text-[13px] text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <TelegramIcon className="h-4 w-4" />
          Telegram
        </a>
      </div>
    </div>
  );
}
