import { Heart } from "lucide-react";
import { SPONSORS_URL } from "@/lib/links";

export function FooterSponsor() {
  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-gray-200 px-5 py-4 dark:border-gray-800">
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          lpm is free, with no paid tier
        </h2>
        <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
          If it saves you time every day, you can help keep it that way.
        </p>
      </div>
      <a
        href={SPONSORS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-10 items-center gap-2 rounded-full border border-gray-300 px-4 text-[13px] font-medium text-gray-800 transition-colors duration-200 hover:border-gray-400 hover:text-gray-900 dark:border-gray-700 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
      >
        <Heart className="h-3.5 w-3.5 text-pink-600 dark:text-pink-400" aria-hidden />
        Sponsor on GitHub
      </a>
    </div>
  );
}
