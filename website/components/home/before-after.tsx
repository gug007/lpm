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
          title="Stop hunting for the window that’s waiting on you"
          description="A terminal per service, another per agent, and a permission prompt buried under whichever window is in front. In lpm it’s one window, and the sidebar shows which agent is working, done, or needs you."
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
