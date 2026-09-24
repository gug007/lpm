import { SectionHeader } from "@/components/section-header";
import { Walkthrough } from "./walkthrough";

export default function WalkthroughSection() {
  return (
    <section
      id="walkthrough"
      aria-labelledby="walkthrough-heading"
      className="scroll-mt-20 border-y border-gray-100 bg-gray-50/60 py-16 sm:py-24 dark:border-gray-800/60 dark:bg-white/[0.015]"
    >
      <div className="mx-auto mb-10 max-w-3xl px-6">
        <SectionHeader
          eyebrow="Tabs vs. a project sidebar"
          title={<span id="walkthrough-heading">The interruption test</span>}
          description="The tour above shows lpm by itself. This is the comparison: one interruption across nine terminal sessions, first in a flat tab row, then with the same nine grouped by project. Nothing is created or closed along the way. You drive every step."
          className="mb-0"
        />
      </div>
      <Walkthrough />
    </section>
  );
}
