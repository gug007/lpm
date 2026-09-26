import {
  MAKER_LINKEDIN_URL,
  MAKER_X_URL,
  TIKTOK_URL,
  YOUTUBE_CHANNEL_URL,
} from "@/lib/links";

type Account = {
  href: string;
  label: string;
  hoverClass: string;
  path: string;
};

const ACCOUNTS: Account[] = [
  {
    href: YOUTUBE_CHANNEL_URL,
    label: "lpm on YouTube",
    hoverClass: "hover:text-[#ff0033] dark:hover:text-[#ff0033]",
    path: "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  },
  {
    href: TIKTOK_URL,
    label: "lpm on TikTok",
    hoverClass: "hover:text-gray-900 dark:hover:text-white",
    path: "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z",
  },
  {
    href: MAKER_X_URL,
    label: "lpm's maker on X",
    hoverClass: "hover:text-black dark:hover:text-white",
    path: "M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z",
  },
  {
    href: MAKER_LINKEDIN_URL,
    label: "lpm's maker on LinkedIn",
    hoverClass: "hover:text-[#0a66c2] dark:hover:text-[#4a94e6]",
    path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
  },
];

export function FooterFollow() {
  return (
    <nav
      aria-label="Follow lpm"
      className="mt-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 border-y border-gray-200 dark:border-gray-800 py-5"
    >
      <div>
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          Follow lpm
        </h2>
        <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">
          Lessons, short clips and updates from the maker.
        </p>
      </div>
      <ul className="flex gap-2">
        {ACCOUNTS.map((account) => (
          <li key={account.href}>
            <a
              href={account.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={account.label}
              className={`grid size-9.5 place-items-center rounded-[10px] border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors duration-200 ${account.hoverClass}`}
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-[17px]"
                aria-hidden="true"
              >
                <path d={account.path} />
              </svg>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
