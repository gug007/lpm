import { Bot, Coins, Eye, FolderGit2, HardDrive, Network } from "lucide-react";
import { SectionHeader } from "@/components/section-header";

const LIMITS = [
  {
    icon: Network,
    title: "Ports, databases and Docker are shared",
    body: "A copy is a separate folder, not a separate machine. Two copies running the same dev server both want the same port, so run one at a time or give each its own port. At start, lpm names whatever holds a declared port and, by default, asks before stopping it. Migrations in one copy hit the same local database as the rest.",
  },
  {
    icon: Bot,
    title: "Live status is Claude Code and Codex only",
    body: "Gemini CLI and OpenCode run fine in tabs, copies and worktrees, but only Claude Code and Codex send lpm their Working, Needs you and Done states, and only they get the sounds, banners, pushes and forking.",
  },
  {
    icon: Coins,
    title: "Every run uses your own plan",
    body: "lpm doesn’t host a model or sell tokens. Each session runs on your own Claude Code or Codex sign-in, so every extra run spends from the same limits.",
  },
  {
    icon: FolderGit2,
    title: "Worktrees start clean",
    body: "A worktree carries committed files only; .env files, node_modules and uncommitted work stay behind. It needs the project folder at the root of a Git repo that already has a commit, and deleting a worktree in lpm also deletes its branch. Use a duplicate when the agent needs your local state.",
  },
  {
    icon: HardDrive,
    title: "Copies need a local project on disk",
    body: "SSH projects can’t be duplicated or given worktrees. On APFS a copy is near-instant and shares unchanged data at first; on other file systems it is a full copy.",
  },
  {
    icon: Eye,
    title: "Review is still the bottleneck",
    body: "Starting ten runs is one click. Reading ten diffs isn’t. Start as many as you will actually review.",
  },
];

export default function Limits() {
  return (
    <section id="limits" className="scroll-mt-20 py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-6">
        <SectionHeader
          eyebrow="Honest limits"
          title="What running agents in parallel won’t fix"
          description="Worth knowing before you start five at once."
        />
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-2">
          {LIMITS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-600 ring-1 ring-gray-200 dark:bg-white/[0.05] dark:text-gray-400 dark:ring-white/[0.06]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                  {body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
