import { SectionHeader } from "@/components/section-header";
import { BeforeAfterCompare } from "./before-after-compare";
import { BeforeAfterStack } from "./before-after-stack";

export function BeforeAfter() {
  return (
    <section className="relative overflow-x-clip py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          className="mb-12"
          eyebrow="Before / after"
          title="Every service and every agent, in one window"
          description="A window for every service, another for every agent, and no way to tell which one is waiting on you. lpm puts them all in one place."
        />
        <div className="hidden md:block">
          <BeforeAfterCompare />
        </div>
        <div className="md:hidden">
          <BeforeAfterStack />
        </div>
      </div>
    </section>
  );
}
