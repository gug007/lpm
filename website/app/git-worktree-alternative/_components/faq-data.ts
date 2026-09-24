export const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: "What is the difference between git worktree and git clone?",
    answer:
      "A worktree is another working directory attached to the same repository. It shares the object store, branches, stash, config and hooks, and by default Git won't check out one branch in two worktrees. A clone is a separate repository with its own refs and config, so it can sit on any branch. Cloning from a local path hardlinks the object files when it can, so the history takes little extra disk. Neither brings ignored files such as .env or node_modules.",
  },
  {
    question: "What are the limitations of git worktree?",
    answer:
      "A new worktree checks out tracked files from a commit, so .env files, node_modules and uncommitted edits stay behind. By default Git refuses a branch that another worktree already has checked out. All worktrees share one repository's config, hooks and stash, and by default they link to it by absolute path, so moving the main folder breaks them until you run git worktree repair. Ports and local database servers stay shared, as they do with clones and copies.",
  },
  {
    question: "Can I copy a Git repository folder instead of using a worktree?",
    answer:
      "Yes. A copy of the whole folder, .git included, is an independent repository with the same history, branch and remotes, plus every uncommitted and ignored file. Copy the main checkout, not a linked worktree: a worktree's .git is only a pointer file, so its copy would share the original worktree's HEAD and index. On APFS, cp -c -R makes a fast copy-on-write clone. Then delete the copy's inherited .git/worktrees and drop build caches such as .next. lpm Duplicate does both for you.",
  },
  {
    question: "How can two agents work on the same branch at once?",
    answer:
      "Give each agent its own repository. By default, Git won't check out a branch that another worktree already has, but a clone or a full copy has its own refs, so every copy can sit on the same branch. Let each agent attempt the task, keep the result you want, and push only that one. Copies made with lpm Duplicate stay on the original's branch and, by default, carry your uncommitted edits, so every agent starts from your work in progress, not from the last commit.",
  },
  {
    question: "What can I use instead of claude --worktree?",
    answer:
      "Claude Code runs in any folder, such as a clone or a copy. By default, claude --worktree branches from your repository's default branch and checks out tracked files only. A .worktreeinclude file copies selected ignored files such as .env, and a WorktreeCreate hook replaces git worktree with your own script. lpm Duplicate makes up to 50 copies of the project as it is on disk and can start Claude Code or Codex with a prompt, or any other command, in each.",
  },
  {
    question:
      "Does lpm Duplicate copy uncommitted changes, .env files and node_modules?",
    answer:
      "Yes, by default. A copy starts as the project on disk, so uncommitted edits, untracked files, ignored files such as .env, and installed node_modules all come along. Folders named like build output or caches, such as .next, dist, build, out and target, are left behind at any depth, even if Git tracks them. Committed work only resets tracked changes and removes untracked files, but keeps ignored ones. Reinstall dependencies leaves node_modules behind and runs a fresh install in Node projects. Pull latest changes, on by default, tries to fast-forward the copy's branch.",
  },
  {
    question: "How much disk space does a project copy use?",
    answer:
      "On APFS, lpm makes a copy-on-write clone, so the copy shares its unchanged file blocks with the original instead of storing them twice. Space grows as files in the copy change, as builds write new caches, and when Reinstall dependencies writes a fresh node_modules. Build caches such as .next are skipped rather than cloned. On non-APFS volumes, and on Linux file systems without reflink support, the copy is a full copy.",
  },
  {
    question: "How do I get changes from a copy back into my main project?",
    answer:
      "A copy is its own repository with the same remotes, so commit on a branch there and push it, then merge or open a pull request as usual. You can also fetch straight from its folder, for example git fetch ../shop-k3Fq9Z my-branch, and merge the result. In lpm, the copy's Review changes tab shows its diff, and its Git menu can commit, push and create a pull request. Deleting a copy is permanent, so push first.",
  },
  {
    question: "Is lpm Duplicate based on git worktree?",
    answer:
      "No. Duplicate copies the project folder, as a copy-on-write clone on APFS. When the folder is the repository root, the copy gets its own .git with the same history, branch and remotes, not a link back to the original, and lpm removes the worktree entries it inherited from the original. New Worktree, the menu item next to Duplicate, is the one that runs git worktree add.",
  },
  {
    question: "Can lpm create real Git worktrees too?",
    answer:
      "Yes. Right-click a project and choose New Worktree. lpm runs git worktree add on a fresh lpm/<name> branch from the commit you're on, with the same count, label and task options as Duplicate and an optional dependency install. Uncommitted and ignored files stay behind, as with plain Git. Removing an lpm worktree deletes its folder and its branch, even if the branch isn't merged, so push or merge first.",
  },
  {
    question: "Can every project be duplicated?",
    answer:
      "Local projects can, and so can projects on a connected Linux server or another connected Mac. Folders that aren't Git repositories work too; the Git options are skipped. SSH projects can't be duplicated, and a project that is itself a linked Git worktree has to use New Worktree instead. New Worktree needs the project folder to be the root of a Git repository with at least one commit.",
  },
];
