import Image from "next/image";
import statsDashboard from "../_assets/stats-dashboard.webp";

export default function StatsPreview() {
  return (
    <section
      id="dashboard"
      className="scroll-mt-20 overflow-hidden px-3 pb-20 sm:px-6 sm:pb-28"
    >
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-4 flex flex-col gap-1 px-3 text-sm text-gray-500 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:px-0">
          <span className="font-medium text-gray-800 dark:text-gray-200">
            One 30-day view across every configured local project
          </span>
          <span className="text-xs">Today · 7 days · 30 days · All time</span>
        </div>
        <figure className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_20%,rgba(217,119,87,0.18),transparent_36%),radial-gradient(circle_at_80%_75%,rgba(16,163,127,0.16),transparent_34%)] blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-black/10 bg-[#111] shadow-2xl shadow-black/20 ring-1 ring-white/10 dark:border-white/10 sm:rounded-[1.75rem]">
            <div className="relative aspect-[4/5] sm:aspect-[3456/2166]">
              <Image
                src={statsDashboard}
                alt="lpm Stats dashboard showing 30-day Claude Code and Codex token usage by day, project, provider, and recent session"
                fill
                priority
                sizes="(max-width: 640px) 100vw, 1440px"
                className="object-cover object-[66%_bottom] sm:object-bottom"
              />
            </div>
          </div>
          <figcaption className="mt-4 px-3 text-center text-xs leading-relaxed text-gray-400 dark:text-gray-500 sm:px-0">
            Real local usage data shown in lpm. Cost is an estimate; Codex pricing
            is approximate.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
