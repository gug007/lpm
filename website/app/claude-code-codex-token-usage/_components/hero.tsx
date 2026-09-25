import { Fragment } from "react";
import { ArrowDown } from "lucide-react";
import { HeroDownload } from "@/components/home/hero-download";
import { ProofStrip } from "@/components/home/proof-strip";

const JUMP_LINK =
  "inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 sm:min-h-0 dark:text-gray-400 dark:hover:text-white";

const JUMPS = [
  { href: "#check-usage", label: "How to check usage" },
  { href: "#limits", label: "Will I run out?" },
  { href: "#limit-reached", label: "Hit your limit?" },
  { href: "#stats", label: "Where did my tokens go?" },
];

export default function Hero() {
  return (
    <section className="relative overflow-hidden pt-[clamp(4.5rem,9.5vh,6.5rem)] pb-[clamp(1.25rem,3vh,2rem)]">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[42rem] bg-[radial-gradient(circle_at_24%_10%,rgba(217,119,87,0.16),transparent_32%),radial-gradient(circle_at_76%_8%,rgba(16,163,127,0.13),transparent_30%)] dark:bg-[radial-gradient(circle_at_24%_10%,rgba(217,119,87,0.2),transparent_32%),radial-gradient(circle_at_76%_8%,rgba(16,163,127,0.17),transparent_30%)]"
      />
      <div className="max-w-5xl mx-auto px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-emerald-700 dark:text-emerald-300/70 mb-5">
          Free, open-source Mac app
        </p>
        <h1 className="text-[2.25rem] sm:text-5xl md:text-[clamp(2.75rem,6.2vh,3.75rem)] font-extrabold tracking-tight leading-[1.06] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-600 dark:from-white dark:via-gray-100 dark:to-gray-400 bg-clip-text text-transparent">
          Track Claude Code and Codex usage: tokens, cost, and plan limits.
        </h1>
        <p className="mt-5 text-pretty text-base sm:text-[17px] text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
          See where your tokens went, by project and session, and how much of
          your 5-hour and weekly limits is left, with a verdict on whether
          you&apos;ll run out before the reset. Hit a limit anyway? lpm can send
          your next prompt when it resets.
        </p>

        <div className="mt-[clamp(1.25rem,3vh,1.75rem)] flex justify-center">
          <HeroDownload source="token-usage-hero" />
        </div>

        <ProofStrip />

        <nav
          aria-label="On this page"
          className="mt-[clamp(0.75rem,2vh,1.25rem)] flex flex-col items-center sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-5 sm:gap-y-2"
        >
          {JUMPS.map(({ href, label }, index) => (
            <Fragment key={href}>
              {index > 0 && (
                <span
                  aria-hidden
                  className="hidden text-gray-300 sm:inline dark:text-gray-700"
                >
                  ·
                </span>
              )}
              <a href={href} className={JUMP_LINK}>
                {label}
                <ArrowDown className="h-3.5 w-3.5" aria-hidden />
              </a>
            </Fragment>
          ))}
        </nav>
      </div>
    </section>
  );
}
