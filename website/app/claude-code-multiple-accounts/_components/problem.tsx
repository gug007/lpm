import { SectionHeader } from "@/components/section-header";

const PAINS: { title: string; body: string }[] = [
  {
    title: "Claude Code signs into one account at a time",
    body: "The CLI has no built-in profiles. Moving between a company seat and a personal subscription means /logout, a browser OAuth round-trip, and losing whatever the previous account had in flight. Do that four times a day and it stops being a login and starts being a tax.",
  },
  {
    title: "Account switchers flip your whole machine",
    body: "Tools like claude-swap swap the active credentials globally: every project changes account at once, and already-running sessions silently keep the old identity until you restart them. A switch made for one repo quietly re-routes every other repo too.",
  },
  {
    title: "Work and personal usage blur together",
    body: "Each Claude subscription has its own usage allowance. When one login serves every repo, a heavy afternoon on a side project eats the quota your work project needed — and there's no way to tell which project spent it.",
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="The problem"
          title="Three Claude accounts, one CLI, endless juggling"
          description="Company seat, client seat, personal subscription — plenty of developers hold several Claude accounts. The tooling assumes you have one."
        />
        <div className="space-y-8">
          {PAINS.map(({ title, body }) => (
            <div
              key={title}
              className="rounded-2xl border border-gray-200 dark:border-gray-800 p-6"
            >
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
