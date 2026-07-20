import { SectionHeader } from "@/components/section-header";

const BARS = [38, 52, 24, 67, 46, 74, 31, 88, 58, 79, 43, 92];
const PROJECTS = [
  { name: "frontend", sessions: "42 sessions", width: "88%" },
  { name: "api", sessions: "31 sessions", width: "64%" },
  { name: "docs", sessions: "18 sessions", width: "38%" },
];

export default function Insights() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <SectionHeader
          eyebrow="Every useful angle"
          title="From the whole month to one agent session"
          description="Start with the trend, then narrow the view until you know which project, provider, and model drove it."
        />

        <div className="grid gap-4 rounded-[2rem] bg-[#0d0d0d] p-4 text-white shadow-2xl shadow-black/10 ring-1 ring-black/10 sm:grid-cols-2 sm:p-6 lg:grid-cols-6">
          <article className="rounded-2xl border border-white/10 bg-[#181818] p-5 sm:col-span-2 lg:col-span-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-white/45">Daily activity</p>
                <h3 className="mt-1 text-lg font-semibold">See the rhythm, not just the total</h3>
              </div>
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-white/55">
                Volume / Share
              </span>
            </div>
            <div
              className="mt-8 flex h-40 items-end gap-2 border-b border-white/10"
              aria-hidden="true"
            >
              {BARS.map((height, index) => (
                <div
                  key={`${height}-${index}`}
                  className="flex min-w-0 flex-1 flex-col justify-end gap-0.5"
                  style={{ height: `${height}%` }}
                >
                  {index % 3 === 0 && (
                    <span className="block min-h-2 flex-[0.18] rounded-t-sm bg-[#10A37F]" />
                  )}
                  <span className="block min-h-3 flex-1 rounded-t-sm bg-[#D97757]" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-white/35">
              <span>Start</span>
              <span>Peak day highlighted in your totals</span>
              <span>Now</span>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#181818] p-5 sm:col-span-1 lg:col-span-2">
            <p className="text-xs font-medium text-white/45">Provider share</p>
            <h3 className="mt-1 text-lg font-semibold">Claude Code vs Codex</h3>
            <div className="mt-7 flex items-center justify-center">
              <div
                className="relative h-32 w-32 rounded-full bg-[conic-gradient(#D97757_0deg_278deg,#10A37F_278deg_360deg)]"
                aria-hidden="true"
              >
                <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-[#181818]">
                  <span className="text-xl font-semibold">100%</span>
                  <span className="text-[10px] text-white/40">accounted for</span>
                </div>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2 text-xs">
              <span className="flex items-center gap-2 text-white/65">
                <span className="h-2 w-2 rounded-full bg-[#D97757]" aria-hidden />
                Claude Code
              </span>
              <span className="flex items-center gap-2 text-white/65">
                <span className="h-2 w-2 rounded-full bg-[#10A37F]" aria-hidden />
                Codex
              </span>
            </div>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#181818] p-5 sm:col-span-1 lg:col-span-2">
            <p className="text-xs font-medium text-white/45">Token composition</p>
            <h3 className="mt-1 text-lg font-semibold">Fresh, cached, output, reasoning</h3>
            <div className="mt-8 flex h-3 overflow-hidden rounded-full" aria-hidden="true">
              <span className="w-[12%] bg-white/90" />
              <span className="w-[71%] border-l-2 border-[#181818] bg-white/60" />
              <span className="w-[12%] border-l-2 border-[#181818] bg-white/35" />
              <span className="w-[5%] border-l-2 border-[#181818] bg-white/20" />
            </div>
            <p className="mt-6 text-sm leading-relaxed text-white/50">
              Check whether context is being reused efficiently and how much of
              the result comes from output or reasoning tokens.
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-[#181818] p-5 sm:col-span-2 lg:col-span-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-white/45">Projects & sessions</p>
                <h3 className="mt-1 text-lg font-semibold">Follow usage back to the codebase</h3>
              </div>
              <span className="text-[11px] text-white/35">Tokens · Sessions · Name</span>
            </div>
            <div className="mt-5 space-y-3">
              {PROJECTS.map((project) => (
                <div key={project.name} className="flex items-center gap-3 text-xs">
                  <span className="w-16 font-medium text-white/75">{project.name}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                    <span
                      className="block h-full rounded-full bg-[#6BA5E7]/70"
                      style={{ width: project.width }}
                    />
                  </span>
                  <span className="w-20 text-right text-white/35">{project.sessions}</span>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm leading-relaxed text-white/50">
              Open recent sessions to see provider, model, duration, recency,
              and the token mix behind each run.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
