import { CodeBlock } from "@/components/config/code-block";
import { DocLink } from "@/components/config/doc-link";
import { Section } from "@/components/config/section";
import { InstallStepsList } from "@/components/install-steps-list";
import { CODE, P } from "@/components/prose";
import { docsPath } from "@/lib/docs-pages";
import type { InstallStep } from "@/lib/install-steps";
import { AUTOMATIONS_PATH } from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const CREATE: InstallStep[] = [
  {
    text: "Open More at the bottom of the sidebar, then Automations, and click New automation.",
  },
  {
    text: "Name it and pick what it runs: AI prompt, Command or Action. For a prompt, choose the agent, model and effort at the right of the box.",
  },
  {
    text: "Pick where it runs. Standalone runs in your home folder; a project runs in its folder, in a fresh copy, or in a new Git worktree that leaves your real folder untouched.",
  },
  {
    text: "Choose Full access or Read only. Nobody is there to approve its steps, so pick Read only for a job that should only look.",
  },
  {
    text: "Set when it runs with a Simple schedule, a Cron line or an Event, then click Create automation. Run now starts it straight away.",
  },
];

export function AutomationsGuide() {
  return (
    <Section
      title="Automations"
      description="An automation runs an agent prompt, a shell command or one of a project's actions on a schedule, or when something happens, and keeps every run for you to read."
    >
      <GuideLesson lesson="create-an-automation" />

      <DocsHeading id="create">Create one</DocsHeading>
      <InstallStepsList steps={CREATE} />

      <DocsHeading id="events">When something happens</DocsHeading>
      <p className={`mb-4 ${P}`}>
        Set When to Event and pick what starts the automation, and lpm
        reacts to what it sees instead of the clock. The row under the event
        takes names, separated by commas, to narrow it down.
      </p>
      <GuideList
        items={[
          "CI fails: a commit you pushed from this computer fails its checks. Name branches to narrow it. It needs the GitHub CLI, or the GitLab CLI for a GitLab project, signed in.",
          "A service crashes: one of the project's services exits with an error code, noticed within a minute. Name services to narrow it.",
          "An agent finishes: an agent in a terminal ends its turn, in this project or in others you name. It starts a prompt or a command, not an action, whose own agent would finish and start it again.",
          "A PR gets a review: someone with write access, or a bot, reviews a pull request you opened and asks for changes or leaves comments. An approval on its own doesn't count, and neither do your own comments. It stops after three runs in a row that only bots answered.",
          "A PR is opened: you or someone with write access opens a pull request, or marks a draft ready for review.",
        ]}
      />
      <p className={`mt-4 ${P}`}>
        For both pull request events, name branches under Into, such as main,
        to follow only pull requests into them. lpm checks every two minutes
        through the GitHub CLI, or through the GitLab CLI for a GitLab
        project, where merge requests work the same way. Whichever one your
        project uses has to be signed in. When the automation runs in the
        project&rsquo;s own folder, it works in the copy or worktree that has
        the pull request&rsquo;s branch checked out. A pull request opened
        under your name during one of its own runs doesn&rsquo;t start it
        again.
      </p>
      <p className={`mt-4 ${P}`}>
        At most sets how often an event can start it: once per commit (once
        per review or once per PR for the pull request events), or once a
        day. A CI automation stops after three runs in a row for failures on
        the same branch, until CI passes there.
      </p>
      <p className={`mt-4 ${P}`}>
        The run is told what happened, at the top of a prompt and in the{" "}
        <code className={CODE}>LPM_EVENT_</code>{" "}variables, which hold
        the pull request&rsquo;s number and link for the PR events. For
        example, to fix CI on main in a worktree of its own:
      </p>
      <div className="mt-4">
        <CodeBlock filename="In a terminal">
          lpm automations add fix-ci --label &quot;Fix CI&quot; \
          {"\n  "}--on ciFailed --branches main --duplicate worktree \
          {"\n  "}--agent claude \
          {"\n  "}--prompt &quot;Make the failing checks pass and push the fix.&quot;
        </CodeBlock>
      </div>
      <p className={`mt-4 ${P}`}>
        The pull request events are{" "}
        <code className={CODE}>--on prReviewed</code>{" "}and{" "}
        <code className={CODE}>--on prOpened</code>, and{" "}
        <code className={CODE}>--branches</code>{" "}fills in Into.
      </p>

      <DocsHeading id="runs">Read a run and reply</DocsHeading>
      <p className={P}>
        Every run keeps its outcome and how long it took. Open one to read the
        agent&rsquo;s answer as a conversation, and reply there to keep it
        going. A running job shows its output live.
      </p>

      <DocsHeading id="ask">Let it ask you first</DocsHeading>
      <p className={`mb-4 ${P}`}>
        In the prompt, say when the agent should ask, for example before it
        picks a version number. There is nothing to switch on. When it needs
        you, the Automations row says Needs you and a notice shows the
        question; one click answers it, and the agent carries on in the same
        conversation. Until you answer, the automation waits, and a run that
        comes due is skipped.
      </p>
      <GuideLesson lesson="automations-that-ask-you-first" />

      <DocsHeading id="good-to-know">Good to know</DocsHeading>
      <GuideList
        items={[
          <>
            Automations fire only while lpm is running on an awake computer.
            For jobs overnight, turn on Keep awake or run them on{" "}
            <DocLink href={docsPath("other-computers")}>
              a computer that stays on
            </DocLink>
            .
          </>,
          "Only one run of a job goes at a time. A run that comes due during it is skipped.",
          "Add a check, such as “are there new commits?”, and the job runs only when it passes. A verify command, such as your tests, marks each run passed or failed.",
          "Full access is the default. OpenCode jobs always run with full access.",
          "Each automation can use the Claude account you pick for it.",
          <>
            Agents and scripts can manage them too, with{" "}
            <code className={CODE}>lpm automations</code>, and{" "}
            <DocLink href={docsPath("phone")}>lpm Link</DocLink>{" "}can create,
            run, pause and answer them from your phone.
          </>,
        ]}
      />

      <GuideMore
        links={[{ href: AUTOMATIONS_PATH, label: "scheduling Claude Code tasks" }]}
      />
    </Section>
  );
}
