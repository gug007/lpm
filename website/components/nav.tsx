import Image from "next/image";
import Link from "next/link";
import { AI_AGENTS_PATH, RELEASES_URL } from "@/lib/links";
import { GitHubStarButton } from "./github-star-button";
import { NavMobileMenu } from "./nav-mobile-menu";
import { ThemeToggle } from "./theme-toggle";

const linkClass =
  "text-[13px] text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors duration-200";

export function Nav() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/70 dark:bg-[#111]/70"
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-base font-bold tracking-tight text-gray-900 dark:text-white"
        >
          <Image
            src="/icon.png"
            alt="lpm icon"
            width={20}
            height={20}
            priority
            className="h-5 w-5 rounded bg-gray-700 p-0.5"
          />
          lpm
        </Link>
        <div className="flex items-center gap-3 sm:gap-5">
          <GitHubStarButton />
          <Link href="/config" className={linkClass}>
            Docs
          </Link>
          <Link
            href={AI_AGENTS_PATH}
            className={`hidden md:inline whitespace-nowrap ${linkClass}`}
          >
            For AI agents
          </Link>
          <a href={RELEASES_URL} className={`hidden md:inline ${linkClass}`}>
            Releases
          </a>
          <ThemeToggle />
          <NavMobileMenu />
        </div>
      </div>
    </nav>
  );
}
