import { DocLink } from "@/components/config/doc-link";
import { Section } from "@/components/config/section";
import { InstallStepsList } from "@/components/install-steps-list";
import { CODE, P } from "@/components/prose";
import { docsPath } from "@/lib/docs-pages";
import type { InstallStep } from "@/lib/install-steps";
import { GIT_TERMINAL_MAC_PATH, REVIEW_CHANGES_PATH } from "@/lib/links";
import { DocsHeading } from "../docs-heading";
import { GuideKey } from "../guide-key";
import { GuideLesson } from "../guide-lesson";
import { GuideList } from "../guide-list";
import { GuideMore } from "../guide-more";

const REVIEW: InstallStep[] = [
  {
    text: "Click the three dots above the terminal and choose Review changes.",
  },
  {
    text: "Every uncommitted change is in one view, file by file. Red is how a line was, green is how it is now. Click a file in the list to see just that one.",
  },
  {
    text: "To drop a change, hover the file, click the undo arrow and confirm with Discard.",
  },
  {
    text: "Click Commit in the footer, type a message or let AI write it, and commit.",
  },
];

export function ReviewGuide() {
  return (
    <Section
      title="Review and Git"
      description="Whatever an agent changes sits in your project folder until it is committed. Read it all in one view, undo what you don't want, and ship the rest without leaving lpm."
    >
      <GuideLesson lesson="review-code-changes" />

      <DocsHeading id="review">Review what changed</DocsHeading>
      <InstallStepsList steps={REVIEW} />
      <p className={`mt-4 ${P}`}>
        <GuideKey mac="⌘⇧R" />{" "}opens the review straight away. You can edit
        and save right in the diff, and lpm won&rsquo;t overwrite a file an
        agent changed in the meantime.
      </p>

      <DocsHeading id="commit">Commit and open a pull request</DocsHeading>
      <GuideList
        items={[
          "AI commit messages: your installed agent CLI (Claude Code, Codex, Gemini CLI or OpenCode) writes a conventional-commit message from the diff. Auto Commit does it in one click, and can push too.",
          "In the commit dialog you tick files or whole folders. It commits whole files; there is no line-level staging.",
          "Auto Create PR goes from uncommitted work to an open GitHub pull request in one step: a new AI-named branch if you are on the default one, a commit, a push, and a written title and description.",
          "When your branch has a pull request, the footer shows PR #N, colored by its state. A merged or closed one opens on GitHub; an open one opens its card, covered under Merge a pull request.",
          "Merge a branch from the branch switcher. When Git reports conflicts, Resolve with AI clears the markers and stages the files for your review; the commit stays yours.",
          "Tell lpm how to write commit messages, PR titles and branch names, for every project or just one.",
        ]}
      />

      <DocsHeading id="ci">See CI and fix what failed</DocsHeading>
      <GuideList
        items={[
          "The footer says how CI stands: on the branch's pull request, or on the last commit you pushed when there is none. Click it for every check.",
          "When checks fail, re-run the failed jobs, or pick Fix with Claude Code, Codex or another of the project's agents to open a new tab with the failing checks.",
          "lpm follows every commit you push from this computer, whether you, an agent or a terminal pushed it, and tells you when CI fails on it and when that branch passes again: in the app, and with a banner when you are in another app.",
          <>
            <DocLink href={docsPath("phone")}>lpm Link</DocLink>{" "}can tell
            you too: turn on CI results in its notification settings, which are
            off until you do. The phone shows the checks, re-runs and fixes.
          </>,
          <>
            All of it reads GitHub through the GitHub CLI, so{" "}
            <code className={CODE}>gh</code>{" "}has to be installed and signed
            in.
          </>,
        ]}
      />

      <DocsHeading id="merge">Merge a pull request</DocsHeading>
      <p className={`mb-4 ${P}`}>
        Click PR #N in the footer. Its card shows the checks, the review and
        whether the branch conflicts, and merges it when GitHub says it can
        go. Pick a merge commit, squash or rebase, whichever the repository
        allows, and whether to delete the branch on GitHub.
      </p>
      <GuideList
        items={[
          "While checks run, the arrow beside the button offers When checks pass: lpm merges as soon as they do, and stops if one fails. Now merges without waiting when GitHub allows it.",
          "If GitHub lets you bypass the branch's rules, Bypass requirements is in the same menu. It is never picked for you.",
          "lpm has to stay open while it waits, and your checkout stays on its branch after the merge.",
          "A draft, or one with conflicts, can't be merged from lpm. lpm Link merges a pull request GitHub says is ready.",
        ]}
      />

      <DocsHeading id="files">Read and edit files</DocsHeading>
      <p className={P}>
        The Files tab (<GuideKey mac="⌘⇧E" />) is a file tree with Git status
        colors beside a code editor. <GuideKey mac="⌘P" />{" "}jumps to a file by
        name, or by its full path. It is a light editor, not an IDE: any file can be sent to
        Cursor, VS Code, Windsurf, Zed, Sublime Text or WebStorm at the same
        line.
      </p>

      <GuideMore
        links={[
          { href: REVIEW_CHANGES_PATH, label: "reviewing changes in the terminal" },
          { href: GIT_TERMINAL_MAC_PATH, label: "Git in lpm" },
        ]}
      />
    </Section>
  );
}
