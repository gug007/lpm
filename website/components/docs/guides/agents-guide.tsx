import { Callout } from "@/components/config/callout";
import { DocLink } from "@/components/config/doc-link";
import { Section } from "@/components/config/section";
import { InstallStepsList } from "@/components/install-steps-list";
import { CODE, P } from "@/components/prose";
import { STATUS_AGENT_NAMES } from "@/lib/app-facts";
import { docsPath } from "@/lib/docs-pages";
import type { InstallStep } from "@/lib/install-steps";
import { AI_AGENTS_PATH, PROJECT_SIDEBAR_PATH } from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideKey } from "../guide-key";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const START: InstallStep[] = [
  {
    text: "Open a project and click Claude or Codex in its header. A fresh install adds both buttons to every project.",
  },
  {
    text: "The agent starts in a new tab, in the project's folder, signed in as you. lpm doesn't install agent CLIs: you install them and sign in yourself.",
  },
  {
    text: "Write in the prompt box under the terminal and press Enter to send. Shift+Enter adds a line.",
  },
  {
    text: "For a second agent beside the first, click Split right, then another agent button.",
  },
];

export function AgentsGuide() {
  return (
    <Section
      title="Agents and status"
      description="Every project has its own terminals next to its services. Start an agent in one, and lpm shows what it is doing without you watching the tab."
    >
      <GuideLesson lesson="run-any-ai-coding-agent" />

      <DocsHeading id="start">Start an agent</DocsHeading>
      <InstallStepsList steps={START} />
      <p className={`mt-4 ${P}`}>
        New tab is <GuideKey mac="⌘T" />, close is <GuideKey mac="⌘W" />, and{" "}
        <GuideKey mac="⌘D" />{" "}splits the pane to the right.
      </p>

      <DocsHeading id="any-agent">Add any other agent</DocsHeading>
      <p className={P}>
        Any command can be a button. Click + Action in the header, give it a
        name, and type the command you would run in a terminal, such as{" "}
        <code className={CODE}>agent</code>{" "}for Cursor&rsquo;s CLI. It joins
        Claude and Codex in the header. The{" "}
        <DocLink href={docsPath("terminals")}>Terminals</DocLink>{" "}page has the
        config behind those buttons.
      </p>

      <DocsHeading id="status">Read the status</DocsHeading>
      <GuideList
        items={[
          "An agent's tab shows Working, Needs you, Done or Problem.",
          "The sidebar lists every session under its project, with a running timer. Click a row to open its tab.",
          <>
            {STATUS_AGENT_NAMES} report on their own. Any other agent can post
            the same states with <code className={CODE}>lpm set-status</code>.
          </>,
          "Claude Code and Codex also get session tools: resume a past conversation, fork one into a new tab, and switch model or effort from the menu next to Send.",
        ]}
      />

      <DocsHeading id="alerts">Get told when one needs you</DocsHeading>
      <p className={P}>
        In Settings, pick a chime, a system sound or your own audio file for
        when an agent is done, wants approval or fails. When lpm is in the
        background you get a system notification too, and{" "}
        <DocLink href={docsPath("phone")}>lpm Link</DocLink>{" "}sends a push to
        your phone.
      </p>
      <Callout title="On Linux">
        <p>
          Sounds need a sound player, and banners need your desktop&rsquo;s
          notification service.
        </p>
      </Callout>

      <GuideMore
        links={[
          { href: AI_AGENTS_PATH, label: "lpm for Claude Code and Codex" },
          { href: PROJECT_SIDEBAR_PATH, label: "status in the sidebar" },
        ]}
      />
    </Section>
  );
}
