import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { jsonLdString } from "@/lib/structured-data";

type QA = {
  question: string;
  answer: ReactNode;
  answerText?: string;
};

const FAQS: QA[] = [
  {
    question: "Can I use lpm as my primary git terminal on Mac?",
    answer: (
      <>
        Yes, and the git-specific plumbing carries over untouched. A pane is a
        real login shell in a real terminal session, so your{" "}
        <code className="text-xs">credential.helper</code> keeps talking to the
        macOS Keychain, your SSH agent still authenticates pushes, your
        commit-signing key still signs commits, and every alias in your{" "}
        <code className="text-xs">~/.gitconfig</code> — the{" "}
        <code className="text-xs">git lg</code> you have muscle memory for —
        expands the same way it does in Terminal.app. Nothing about the git in
        your shell is wrapped or re-implemented; you get that shell right
        beside your running service panes.
      </>
    ),
    answerText:
      "Yes, and the git-specific plumbing carries over untouched. A pane is a real login shell in a real terminal session, so your credential.helper keeps talking to the macOS Keychain, your SSH agent still authenticates pushes, your commit-signing key still signs commits, and every alias in your ~/.gitconfig — the git lg you have muscle memory for — expands the same way it does in Terminal.app. Nothing about the git in your shell is wrapped or re-implemented; you get that shell right beside your running service panes.",
  },
  {
    question: "Does lpm replace a GUI git client like GitKraken or SourceTree?",
    answer: (
      <>
        For the everyday loop, often yes. lpm has a branch switcher with
        search, a diff review of every uncommitted change, a Commit dialog
        that drafts the message with AI and can Commit and Push, and Create PR
        for GitHub. It does not draw a branch graph or stage individual hunks;
        for those you run{" "}
        <code className="text-xs">git log --oneline --graph</code> or{" "}
        <code className="text-xs">git add -p</code> in the shell pane, or keep
        your GUI client open alongside lpm.
      </>
    ),
    answerText:
      "For the everyday loop, often yes. lpm has a branch switcher with search, a diff review of every uncommitted change, a Commit dialog that drafts the message with AI and can Commit and Push, and Create PR for GitHub. It does not draw a branch graph or stage individual hunks; for those you run git log --oneline --graph or git add -p in the shell pane, or keep your GUI client open alongside lpm.",
  },
  {
    question: "Will my dev server stop running when I switch git branches inside lpm?",
    answer: (
      <>
        No. lpm never stops or restarts a service because you ran{" "}
        <code className="text-xs">git checkout feature/xyz</code>. Services
        run from the project folder, so after the checkout your dev server is
        serving the new branch&apos;s files, and most hot-reload on their own.
        If a branch needs a dependency install or a migration, you decide when
        to stop and start. To keep one branch running while you work on
        another, open it with New Worktree.
      </>
    ),
    answerText:
      "No. lpm never stops or restarts a service because you ran git checkout feature/xyz. Services run from the project folder, so after the checkout your dev server is serving the new branch's files, and most hot-reload on their own. If a branch needs a dependency install or a migration, you decide when to stop and start. To keep one branch running while you work on another, open it with New Worktree.",
  },
  {
    question: "How does lpm help with PR review workflows on Mac?",
    answer:
      "Choose New Worktree on the project. lpm makes a separate checkout on its own branch with its own services, listed under the original in the sidebar. Check out the review branch there and start the services you need to test it; if one wants a port your original is still using, lpm flags the clash when you press Start. Your original branch keeps running untouched, and when you're done you delete the worktree from the sidebar.",
  },
  {
    question: "Can lpm write my commit messages and PR descriptions?",
    answer:
      "Yes, through the AI coding agent you already have installed: Claude Code, Codex, Gemini CLI, or OpenCode. Generate with AI in the Commit dialog writes a conventional-commit message from the selected files, and Create PR drafts the title and description. You can add your own instructions globally or per project. lpm hosts no model, so it runs on your own account.",
  },
  {
    question: "Can I run git bisect or long-running git operations inside lpm?",
    answer: (
      <>
        Yes. A shell pane in lpm is a full terminal session —{" "}
        <code className="text-xs">git bisect</code>,{" "}
        <code className="text-xs">git rebase -i</code>,{" "}
        <code className="text-xs">git filter-branch</code>, and any other
        long-running git operation runs exactly as it would in iTerm2 or
        Terminal.app. The other service panes keep running alongside it so you
        can see the effect of each bisect step on your live stack.
      </>
    ),
    answerText:
      "Yes. A shell pane in lpm is a full terminal session — git bisect, git rebase -i, git filter-branch, and any other long-running git operation runs exactly as it would in iTerm2 or Terminal.app. The other service panes keep running alongside it so you can see the effect of each bisect step on your live stack.",
  },
  {
    question: "Is lpm a good terminal for Mac developers who use the GitHub CLI?",
    answer: (
      <>
        Yes. lpm shell panes run your full shell configuration, so{" "}
        <code className="text-xs">gh pr create</code>,{" "}
        <code className="text-xs">gh pr checkout</code>,{" "}
        <code className="text-xs">gh run watch</code>, and any other GitHub CLI
        command work with your existing auth and aliases. Run{" "}
        <code className="text-xs">gh run watch</code> in a shell pane while your
        dev server streams in the next pane — you get CI output and local output
        in the same window without a browser tab. With gh signed in, the footer
        also shows the current branch&apos;s PR number and state.
      </>
    ),
    answerText:
      "Yes. lpm shell panes run your full shell configuration, so gh pr create, gh pr checkout, gh run watch, and any other GitHub CLI command work with your existing auth and aliases. Run gh run watch in a shell pane while your dev server streams in the next pane — you get CI output and local output in the same window without a browser tab. With gh signed in, the footer also shows the current branch's PR number and state.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(({ question, answer, answerText }) => ({
    "@type": "Question",
    name: question,
    acceptedAnswer: {
      "@type": "Answer",
      text: typeof answer === "string" ? answer : answerText ?? "",
    },
  })),
};

export default function Faq() {
  return (
    <section className="py-20 sm:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <SectionHeader
          eyebrow="FAQ"
          title="What Mac developers ask about terminal git workflows"
        />
        <ul className="space-y-3">
          {FAQS.map(({ question, answer }) => (
            <li key={question}>
              <details className="group rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 transition-colors duration-200 open:border-gray-300 dark:open:border-gray-700 open:bg-gray-50/50 dark:open:bg-white/[0.02]">
                <summary className="flex items-center justify-between gap-4 cursor-pointer list-none px-5 py-4 text-sm font-semibold text-gray-900 dark:text-gray-100 [&::-webkit-details-marker]:hidden">
                  <span>{question}</span>
                  <ChevronDown className="w-4 h-4 shrink-0 text-gray-500 dark:text-gray-400 transition-transform duration-200 group-open:rotate-180" />
                </summary>
                <div className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                  {answer}
                </div>
              </details>
            </li>
          ))}
        </ul>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(faqJsonLd) }}
        />
      </div>
    </section>
  );
}
