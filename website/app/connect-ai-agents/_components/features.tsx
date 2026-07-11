import {
  Activity,
  Copy,
  FileText,
  Play,
  Settings2,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

type Feature = {
  icon: LucideIcon;
  title: string;
  body: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: Play,
    title: "Start, stop, and restart services",
    body: (
      <>
        Agents run <code className="font-mono text-xs">lpm start</code>,{" "}
        <code className="font-mono text-xs">lpm stop</code>, or{" "}
        <code className="font-mono text-xs">lpm service api restart</code> to
        bring a whole project or a single dev server up and down — no more
        asking you to bounce the server for them.
      </>
    ),
  },
  {
    icon: FileText,
    title: "Read your dev-server logs",
    body: (
      <>
        <code className="font-mono text-xs">lpm logs frontend -n 200</code>{" "}
        hands the agent the recent output of any running service, so it can see
        the stack trace it just caused and fix it — instead of guessing.
      </>
    ),
  },
  {
    icon: Timer,
    title: "Wait for readiness, not sleep loops",
    body: (
      <>
        <code className="font-mono text-xs">lpm wait --port 3000</code> blocks
        until a service is actually answering. The skill teaches agents to wait
        on readiness instead of burning turns on blind{" "}
        <code className="font-mono text-xs">sleep</code> loops.
      </>
    ),
  },
  {
    icon: Activity,
    title: "Report and read live status",
    body: (
      <>
        lpm shows a live badge per agent — Running, Waiting, Done, or Error.
        Agents post their own with{" "}
        <code className="font-mono text-xs">lpm set-status</code>, and scripts
        read them back with <code className="font-mono text-xs">lpm status</code>.
      </>
    ),
  },
  {
    icon: Copy,
    title: "Fan out into parallel copies",
    body: (
      <>
        <code className="font-mono text-xs">lpm duplicate</code> clones a project
        into real standalone copies and queues the same prompt in each — the
        fan-out primitive for running several agents on the same task at once.
      </>
    ),
  },
  {
    icon: Settings2,
    title: "Set up projects for you",
    body: (
      <>
        A second skill teaches agents to write and edit lpm project configs —
        services, actions, profiles, and shared team setups — so they can wire
        up a project&rsquo;s services without your help.
      </>
    ),
  },
];

export default function Features() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="What agents can do"
          title="A command-line tool built for AI coding agents"
          description="The lpm skill teaches agents a small, predictable CLI — with agent-friendly exit codes and JSON output on nearly every command."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
