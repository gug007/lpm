import { useAppStore } from "../store/app";
import { RefreshIcon } from "./icons";

// In place of the first-run screen when the project list couldn't be read, so
// someone with projects isn't welcomed as if they had none.
export function ProjectsLoadFailed() {
  const retry = () => {
    useAppStore.setState({ projectsLoad: "loading" });
    void useAppStore.getState().refreshProjects();
  };
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">Couldn&#39;t read your projects</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">They&#39;re still on disk. lpm tries again on its own too.</p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-1.5 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
      >
        <RefreshIcon />
        Retry
      </button>
    </div>
  );
}
