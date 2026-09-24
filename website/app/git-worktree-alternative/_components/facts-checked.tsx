import { ComparisonBasis } from "@/components/vs/comparison-basis";

const SOURCES = [
  {
    href: "https://git-scm.com/docs/git-worktree",
    label: "git-worktree docs",
  },
  {
    href: "https://git-scm.com/docs/git-clone",
    label: "git-clone docs",
  },
  {
    href: "https://www.gnu.org/software/coreutils/manual/html_node/cp-invocation.html",
    label: "GNU cp --reflink",
  },
  {
    href: "https://docs.jj-vcs.dev/latest/cli-reference/#jj-workspace-add",
    label: "jj workspace add",
  },
  {
    href: "https://code.visualstudio.com/docs/devcontainers/containers",
    label: "VS Code Dev Containers",
  },
];

export default function FactsChecked() {
  return (
    <ComparisonBasis
      reviewed="September 24, 2026"
      reviewedIso="2026-09-24"
      sources={SOURCES}
      lpmNote="Git output comes from Git 2.50; every lpm card and row was read from the app's source code."
    />
  );
}
