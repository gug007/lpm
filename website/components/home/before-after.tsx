import { SectionHeader } from "@/components/section-header";
import { BeforeAfterCompare } from "./before-after-compare";
import { CompareDescription } from "./before-after-descriptions";
import { CountLine, StateLegend, WINDOW_COUNT } from "./before-after-legend";
import { LpmLayer, PileLayer } from "./before-after-stage";
import { BeforeAfterSwitch } from "./before-after-switch";

const DESCRIPTION_ID = "before-after-description";

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
        <CompareDescription id={DESCRIPTION_ID} />
        <div className="hidden md:block">
          <BeforeAfterCompare
            before={<PileLayer layout="desk" />}
            after={<LpmLayer layout="desk" />}
            describedBy={DESCRIPTION_ID}
          />
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-x-6">
            <p>
              <CountLine side="before" />
            </p>
            <StateLegend />
            <p className="text-right">
              <CountLine side="after" />
            </p>
          </div>
        </div>
        <div className="md:hidden">
          <BeforeAfterSwitch
            before={<PileLayer layout="phone" />}
            after={<LpmLayer layout="phone" />}
            windows={WINDOW_COUNT}
            counts={{ before: <CountLine side="before" />, after: <CountLine side="after" /> }}
          />
          <div className="mt-3.5">
            <StateLegend />
          </div>
        </div>
      </div>
    </section>
  );
}
