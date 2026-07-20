import { Check, LockKeyhole } from "lucide-react";

const POINTS = [
  "Usage metadata stays on this Mac",
  "Prompts and responses are not included",
  "Only configured local projects are counted",
  "No hosted analytics account is required",
];

export default function Privacy() {
  return (
    <section className="py-20 sm:py-24">
      <div className="mx-auto max-w-5xl px-6">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#0d0d0d] px-6 py-12 text-white ring-1 ring-black/10 sm:px-12 sm:py-16">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#10A37F]/15 blur-3xl" />
          <div className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#D97757]/15 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-5xl">
                Your usage history stays yours.
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
                The stats view is built from usage metadata in local Claude Code
                and Codex session histories. It gives you the operational picture
                without turning your work into another cloud analytics feed.
              </p>
            </div>
            <ul className="space-y-3">
              {POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white/75"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#10A37F]/20 text-[#59D6B6]">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                  </span>
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
