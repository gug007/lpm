"use client";

import { Check, Share } from "lucide-react";
import { isMobilePlatform, usePlatform } from "@/lib/use-platform";
import { DownloadLink } from "./download-link";
import { useSendLink } from "./home/send-link-button";

const PILL =
  "relative inline-flex cursor-pointer items-center gap-1.5 rounded-full after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] bg-gray-900 dark:bg-white px-3.5 py-1.5 text-[12px] font-medium text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors duration-200";

// A phone can't install lpm, so its nav button sends the link on to a
// computer, the same share sheet the hero uses. If neither sharing nor the
// clipboard works, it falls back to Download, whose section says what to do.
export function NavGet() {
  const platform = usePlatform();
  const { state, send } = useSendLink();

  if (!isMobilePlatform(platform) || state === "failed") {
    return <DownloadLink className={PILL}>Download</DownloadLink>;
  }

  const Icon = state === "copied" ? Check : Share;
  return (
    <button
      type="button"
      onClick={send}
      className={PILL}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {state === "copied" ? "Copied" : "Send link"}
    </button>
  );
}
