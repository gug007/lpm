import { SectionHeader } from "@/components/section-header";
import AlternativeGroup from "./alternative-group";
import { ALTERNATIVE_GROUPS } from "./alternatives-data";
import VerdictIcon, { type Verdict } from "./verdict-icon";

const LEGEND: { verdict: Verdict; label: string }[] = [
  { verdict: "yes", label: "Yes" },
  { verdict: "partial", label: "Partly, or depends on setup" },
  { verdict: "no", label: "No" },
];

export default function Alternatives() {
  return (
    <section id="alternatives" className="py-20 sm:py-24">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Other ways to switch tasks"
          title="Git worktree alternatives compared"
          description="The alternatives to git worktree, from git stash to a full project copy, and what each one brings with it."
          className="mb-8"
        />

        <ul
          aria-label="Legend"
          className="mb-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-gray-500 sm:mb-12 dark:text-gray-400"
        >
          {LEGEND.map((item) => (
            <li key={item.verdict} className="inline-flex items-center gap-1.5">
              <VerdictIcon verdict={item.verdict} />
              {item.label}
            </li>
          ))}
        </ul>

        <div className="space-y-9 sm:space-y-12">
          {ALTERNATIVE_GROUPS.map((group) => (
            <AlternativeGroup key={group.id} group={group} />
          ))}
        </div>
      </div>
    </section>
  );
}
