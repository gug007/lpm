import { Copy, FolderTree, Forward, GitFork, Laptop, ListChecks } from "lucide-react";
import { FeatureCard } from "@/components/feature-card";
import { SectionHeader } from "@/components/section-header";

const CARDS = [
  {
    icon: Copy,
    title: "Run in duplicates",
    body: "In the menu beside Send, choose Run in duplicates and pick 2 to 10 runs. The prompt runs in this terminal and in fresh copies of the project, each with its own agent. Nothing starts until you confirm.",
  },
  {
    icon: ListChecks,
    title: "A task for every copy",
    body: "When you duplicate a project or create worktrees, queue work in each new copy: an action, a shell command, or a prompt for an agent, with images if you like. Use one task for all of them, or a different one for each.",
  },
  {
    icon: GitFork,
    title: "Fork a conversation",
    body: "Fork session continues a Claude Code or Codex conversation in a new tab while the original stays as it was. Fork into copy continues it in a fresh copy of the whole project.",
  },
  {
    icon: Forward,
    title: "Send to another tab",
    body: "Hand the prompt you wrote to any tab in this or another open project — to run right away, or to land in that tab’s input for a last edit.",
  },
  {
    icon: FolderTree,
    title: "Labels, folders and statuses",
    body: "Name each copy, group a batch under a sidebar folder, and tag copies In progress, Review or Blocked so a stack of attempts stays readable.",
  },
  {
    icon: Laptop,
    title: "Copies on another Mac",
    body: "Connected a second Mac that has the same project? Choose which Mac each copy is created on — it’s made from that Mac’s own version of the project and shows up in your sidebar.",
  },
];

export default function FanOut() {
  return (
    <section id="fan-out" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-6">
        <SectionHeader
          eyebrow="Fan out"
          title="Send one prompt to many runs"
          description="Start parallel work from wherever the idea is: the prompt box, a live conversation, or the sidebar."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map(({ icon, title, body }) => (
            <FeatureCard key={title} icon={icon} title={title}>
              {body}
            </FeatureCard>
          ))}
        </div>
      </div>
    </section>
  );
}
