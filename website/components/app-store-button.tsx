"use client";

import { trackAppStoreVisit, type AppStoreSource } from "@/lib/analytics";
import { APP_STORE_URL } from "@/lib/links";
import { OsIcon } from "@/components/home/os-icon";

// "outline" is the quiet form for a page whose main action is something else.
export function AppStoreButton({
  source = "mobile-hero",
  variant = "badge",
}: {
  source?: AppStoreSource;
  variant?: "badge" | "outline";
}) {
  if (variant === "outline") {
    return (
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackAppStoreVisit(source)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-gray-300 px-5 text-sm font-medium text-gray-800 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
      >
        <OsIcon os="macos" className="-mt-0.5 h-4 w-4 shrink-0" />
        lpm Link for iPhone · App Store
      </a>
    );
  }
  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAppStoreVisit(source)}
      className="group inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-full bg-black px-10 py-[18px] text-white shadow-sm ring-1 ring-gray-900/10 transition-[background-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-[1px] hover:bg-gray-900 hover:shadow-lg active:translate-y-0 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:ring-white/25 dark:hover:ring-white/40 dark:focus-visible:ring-white dark:focus-visible:ring-offset-gray-950 sm:w-auto sm:max-w-none sm:px-7 sm:py-3.5"
    >
      <OsIcon os="macos" className="h-7 w-7 flex-shrink-0 -mt-0.5 sm:h-6 sm:w-6" />
      <span className="flex flex-col items-start">
        <span className="text-[12px] leading-none tracking-wide text-gray-300 sm:text-[10px]">
          Download on the
        </span>
        <span className="mt-1 text-[21px] font-medium leading-none tracking-tight sm:text-[17px]">
          App Store
        </span>
      </span>
      <span className="sr-only">: lpm Link for iPhone and iPad</span>
    </a>
  );
}
