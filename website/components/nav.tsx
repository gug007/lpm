import Image from "next/image";
import Link from "next/link";
import { AI_AGENTS_PATH, VS_BASE_PATH } from "@/lib/links";
import { GitHubStarButton } from "./github-star-button";
import { NavLink } from "./nav-link";
import { NavMobileMenu } from "./nav-mobile-menu";
import { ThemeToggle } from "./theme-toggle";

// No display utility here: callers own it. An unprefixed `inline-flex` baked in
// would tie with an unprefixed `hidden` on equal specificity and win on source
// order, silently disabling `hidden md:inline-flex` at phone widths.
const linkClass =
  "items-center h-9 px-1 text-[13px] transition-colors duration-200";

export function Nav() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/80 dark:bg-[#111]/80 border-b border-gray-200/70 dark:border-gray-800/70"
    >
      <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight text-gray-900 dark:text-white"
        >
          <Image
            src="/icon.png"
            alt=""
            width={20}
            height={20}
            priority
            className="h-5 w-5 rounded bg-gray-700 p-0.5"
          />
          lpm
        </Link>
        <div className="-mr-2 flex items-center gap-3 sm:gap-5">
          <span className="hidden sm:inline-flex">
            <GitHubStarButton />
          </span>
          <NavLink href="/config" className={`inline-flex ${linkClass}`}>
            Docs
          </NavLink>
          <NavLink
            href={AI_AGENTS_PATH}
            className={`hidden md:inline-flex whitespace-nowrap ${linkClass}`}
          >
            For AI agents
          </NavLink>
          <NavLink href={VS_BASE_PATH} className={`hidden md:inline-flex ${linkClass}`}>
            Compare
          </NavLink>
          <Link
            href="/#download"
            className="inline-flex items-center rounded-full bg-gray-900 dark:bg-white px-3.5 py-1.5 text-[12px] font-medium text-white dark:text-gray-900 hover:bg-gray-700 dark:hover:bg-gray-200 transition-colors duration-200"
          >
            Download
          </Link>
          <ThemeToggle />
          <NavMobileMenu />
        </div>
      </div>
    </nav>
  );
}
