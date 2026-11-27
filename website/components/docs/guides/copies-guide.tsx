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

      <DocsHeading id="issue">Start from an issue</DocsHeading>
      <p className={`mb-4 ${P}`}>
        In the New worktree dialog, click From issue&hellip; next to Issue
        and pick one of the repository&rsquo;s open issues. Type to search
        them by number, title, label or author. Then:
      </p>
      <GuideList
        items={[
          "The worktree's branch is named after the issue, such as 431-retry-failed-webhooks, with -2, -3 and so on when that name is taken.",
          "Run on the worktree switches to the first of the project's actions that starts an agent, unless it already starts one.",
          "The issue's title, link, text and comments go at the top of the agent's prompt, above anything you typed. A very long one is cut short, with the command that reads the rest.",
          "When you create the pull request from that branch in lpm, Close #431 on merge is ticked, which adds “Closes #431” to its description.",
        ]}
      />
      <p className={`mt-4 ${P}`}>
        It works with GitHub issues through the GitHub CLI and with GitLab
        issues through the GitLab CLI, signed in, in a repository with a
        remote. From a terminal,{" "}
        <code className={CODE}>lpm worktree</code>{" "}takes{" "}
        <code className={CODE}>--issue</code>{" "}and the issue&rsquo;s number.
      </p>

      <DocsHeading id="archive">Archive a project</DocsHeading>
      <p className={`mb-4 ${P}`}>
        Right-click a project you&rsquo;re done with and choose Archive
        project. It leaves the sidebar, the project switcher and lpm Link,
        and its duplicates and worktrees go with it. Its services stop, its
        terminals close and its automations pause. Its setup, notes, memory
        and folder stay as they are, so archiving alone frees no disk space.
      </p>
      <GuideLesson lesson="archive-projects" />
      <p className={`mt-4 ${P}`}>
        Archived projects wait on the Archive page, under More at the bottom
        of the sidebar, with the space each folder takes and how much of it
        can be rebuilt. To get that space
        back, click Free at the top of the page for every archived project, or
        Free in a row&rsquo;s &hellip; menu for one. It moves the folders an
        install or a build recreates to the Trash (the Recycle Bin on
        Windows): node_modules, .venv, __pycache__, .next, .nuxt, .turbo,
        .svelte-kit and .parcel-cache wherever they are in the folder, and
        target, dist, build and venv when Git tracks nothing inside them. Your
        code, Git history and setup stay. The space comes back when you empty
        the Trash. If you unarchive the project later, install or build again
        to bring those folders back.
      </p>
      <p className={`mt-4 ${P}`}>
        To look inside an archived project without unarchiving it, click Open
        on its row. It shows under From the Archive in the sidebar, still
        archived, and its automations stay paused. It closes as soon as you
        show something else, or click Close above it, and any services you
        started in it stop. Unarchive puts a project back where it was, set up
        as before, and its automations resume from then on without catching up
        on the runs they missed. From a terminal,{" "}
        <code className={CODE}>lpm archive</code>{" "}and{" "}
        <code className={CODE}>lpm unarchive</code>{" "}do the same.
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
