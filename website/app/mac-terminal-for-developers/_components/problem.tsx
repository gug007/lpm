import { Layers, RefreshCcw, ScrollText, type LucideIcon } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Layers,
    title: "Monorepo service sprawl",
    body: "Your monorepo has an API, a worker, a frontend, a database, and a cron job. Every morning you open five tabs, cd into each one, run the right command, and hope nothing crashed while you were in standup. There has to be a better way.",
  },
  {
    icon: RefreshCcw,
    title: "Context evaporates when you switch repos",
    body: "You're three services deep in a debugging session when Slack pings with a blocking issue on a different client project. You switch repos and your running services, terminal history, and mental state all disappear. Getting back is a 15-minute tax every time.",
  },
  {
    icon: ScrollText,
    title: "Logs drown in one shared scroll buffer",
    body: "When five services write to the same terminal, you debug by grepping a firehose. Was that error from the API or the worker? Which service restarted? You shouldn't need to be a log archaeologist to run your own stack.",
  },
];

export default function Problem() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="The daily friction"
          title="Your terminal was built for commands, not for building software"
          description="Running a modern stack on a Mac means managing half a dozen processes in half a dozen windows. That's not a workflow — it's damage control."
          className="mb-12"
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {CARDS.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title} size="lg">
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
