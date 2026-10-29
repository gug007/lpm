import Link from "next/link";
import LimitsLegend from "@/app/claude-code-codex-token-usage/_components/limits-legend";
import { TEXT_LINK } from "@/app/claude-code-codex-token-usage/_components/page-styles";
import PaceSimulator from "@/app/claude-code-codex-token-usage/_components/pace-simulator";
import { CLAUDE_ACCOUNTS_PATH, MOBILE_PATH, TOKEN_USAGE_PATH } from "@/lib/links";

export default function CalculatorSection() {
  return (
    <section id="calculator" aria-label="Limit calculator" className="pb-16 sm:pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <PaceSimulator />
        <LimitsLegend />
        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          Your numbers stay on this page. In the lpm desktop app the same card
          fills itself in from Claude Code and Codex:{" "}
          <Link href={TOKEN_USAGE_PATH} className={TEXT_LINK}>
            a usage meter in the sidebar
          </Link>
          ,{" "}
          <Link href={CLAUDE_ACCOUNTS_PATH} className={TEXT_LINK}>
            a limits card for every Claude account
          </Link>
          , and the same meters in the{" "}
          <Link href={MOBILE_PATH} className={TEXT_LINK}>
            lpm iPhone app
          </Link>
          .
        </p>
      </div>
    </section>
  );
}
