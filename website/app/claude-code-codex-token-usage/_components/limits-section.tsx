import Link from "next/link";
import { SectionHeader } from "@/components/section-header";
import { CLAUDE_ACCOUNTS_PATH, MOBILE_PATH } from "@/lib/links";
import LimitsExplainer from "./limits-explainer";
import LimitsLegend from "./limits-legend";
import PaceSimulator from "./pace-simulator";
import { TEXT_LINK } from "./page-styles";

export default function LimitsSection() {
  return (
    <section id="limits" className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Plan limits"
          title="Claude Code and Codex 5-hour and weekly limits, with pace"
          description="A percentage means little until you know how much of the window has passed, so lpm judges every meter against the clock. Set your own numbers and see what it would tell you."
          className="mb-12"
        />

        <h3 className="mb-6 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
          Will you run out before the reset?
        </h3>
        <PaceSimulator />

        <LimitsLegend />
        <LimitsExplainer />

        <p className="mx-auto mt-10 max-w-3xl text-center text-sm leading-relaxed text-gray-500 dark:text-gray-400">
          The sidebar meter is on by default and shows the weekly window; switch
          it to 5-hour or whichever is higher, hide a tool, or hover a row for
          the full card. Every Claude account you add in lpm gets{" "}
          <Link href={CLAUDE_ACCOUNTS_PATH} className={TEXT_LINK}>
            its own limits card
          </Link>
          , and the{" "}
          <Link href={MOBILE_PATH} className={TEXT_LINK}>
            lpm iPhone app
          </Link>{" "}
          shows the same meters.
        </p>
      </div>
    </section>
  );
}
