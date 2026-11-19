import { Copy, GitBranch } from "lucide-react";
import { Section } from "@/components/config/section";
import { FeatureCard } from "@/components/feature-card";
import { InstallStepsList } from "@/components/install-steps-list";
import { CODE, P } from "@/components/prose";
import type { InstallStep } from "@/lib/install-steps";
import {
  PARALLEL_PATH,
  WORKTREE_AGENTS_PATH,
  WORKTREE_ALTERNATIVE_PATH,
} from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const MAKE: InstallStep[] = [
  {
    text: "Right-click the project in the sidebar and choose Duplicate for copies, or New worktree for Git worktrees.",
  },
  {
    text: "Press + for as many as you need, up to 50. Each one gets a random tag in its name; type over it to name the copy for its job.",
  },
  {
    text: "Give each one something to run if you like: an action, a shell command, or an agent prompt. Use the same task for all of them, or one each.",
  },
  {
    text: "Create them. They appear under the original in the sidebar, each with the original's services and actions, ready to start.",
  },
];

export function CopiesGuide() {
  return (
    <Section
      title="Copies and worktrees"
      description="Two agents in one folder edit the same files. Give each agent a folder of its own instead, then keep the result you like best."
    >
      <GuideLesson lesson="parallel-agents" />

      <DocsHeading id="which">Copy or worktree</DocsHeading>
      <div className="grid gap-3 sm:grid-cols-2">
        <FeatureCard icon={Copy} title="A copy">
          A full folder that stands on its own. It brings your .env files and
          node_modules along, and leaves build output and caches behind. On a
          Mac, copies share disk space with the original; on Windows and Linux
          they are usually full copies.
        </FeatureCard>
        <FeatureCard icon={GitBranch} title="A Git worktree">
          A linked worktree on a new branch from the current commit, sharing
          the repository&rsquo;s history. Uncommitted files stay behind, and
          ignored ones come along only when you tick them under Options.
        </FeatureCard>
      </div>

      <DocsHeading id="make">Make them</DocsHeading>
      <InstallStepsList steps={MAKE} />

      <DocsHeading id="fan-out">One prompt, several attempts</DocsHeading>
      <p className={P}>
        To try one prompt several ways, write it, open the menu next to Send
        and pick Run in duplicates. It runs 2 to 10 times: in the current
        terminal and in new copies of the project, one agent per copy.
      </p>

      <DocsHeading id="good-to-know">Good to know</DocsHeading>
      <GuideList
        items={[
          "Options for copies: keep committed work only, pull the latest changes, reinstall Node dependencies, or group the copies into a sidebar folder.",
          "Copies run the same commands as the original, so give each one its own port, for example through a PORT variable. lpm flags a clash before starting, but it doesn't isolate ports or containers.",
          "Copies and worktrees share the original's session memory, so an agent in one can pick up where another left off.",
          "Deleting a copy removes its folder. Deleting a worktree also deletes its branch, so push anything you want to keep.",
          <>
            From a terminal or an agent,{" "}
            <code className={CODE}>lpm duplicate</code>{" "}and{" "}
            <code className={CODE}>lpm worktree</code>{" "}make 1 to 50 at once.
          </>,
          "SSH projects can't be duplicated.",
        ]}
      />

      <GuideMore
        links={[
          { href: PARALLEL_PATH, label: "running Claude Code in parallel" },
          { href: WORKTREE_AGENTS_PATH, label: "worktrees for AI agents" },
          { href: WORKTREE_ALTERNATIVE_PATH, label: "copies compared with worktrees" },
        ]}
      />
    </Section>
  );
}
