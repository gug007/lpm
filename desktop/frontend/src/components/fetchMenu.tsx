import { useSettingsStore, saveSettings } from "../store/settings";
import { DEFAULT_FETCH_CONFIG, type GitFetchConfig } from "../gitOptions";
import { RefreshIcon } from "./icons";
import { MenuSplitRow } from "./MenuSplitRow";
import { FlagRow } from "./FlagRow";
import type { DrillScreen } from "./DrillMenu";

export function FetchSplitRow({
  busy,
  onRun,
  onConfigure,
}: {
  busy: boolean;
  onRun: () => void;
  onConfigure: () => void;
}) {
  return (
    <MenuSplitRow
      icon={<RefreshIcon />}
      label="Fetch"
      onRun={onRun}
      onConfigure={onConfigure}
      disabled={busy}
    />
  );
}

function FetchConfigBody({
  busy,
  onRun,
}: {
  busy: boolean;
  onRun: () => void;
}) {
  const cfg = useSettingsStore((s) => s.gitFetch) ?? DEFAULT_FETCH_CONFIG;
  const patch = (p: Partial<GitFetchConfig>) =>
    void saveSettings({ gitFetch: { ...cfg, ...p } });
  return (
    <>
      <FlagRow
        label="All remotes"
        flag="--all"
        checked={cfg.all}
        onToggle={() => patch({ all: !cfg.all })}
        disabled={busy}
      />
      <FlagRow
        label="Prune"
        flag="--prune"
        checked={cfg.prune}
        onToggle={() => patch({ prune: !cfg.prune })}
        disabled={busy}
      />
      <FlagRow
        label="Prune tags"
        flag="--prune-tags"
        checked={cfg.pruneTags}
        onToggle={() => patch({ pruneTags: !cfg.pruneTags })}
        disabled={busy}
      />
      <FlagRow
        label="Tags"
        flag="--tags"
        checked={cfg.tags}
        onToggle={() => patch({ tags: !cfg.tags })}
        disabled={busy}
      />
      <button
        onClick={onRun}
        disabled={busy}
        className="mx-1.5 mt-1 flex w-[calc(100%-12px)] items-center justify-center rounded-lg px-2.5 py-2 text-[13px] font-medium text-[var(--accent-green)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
      >
        Run fetch
      </button>
    </>
  );
}

export function fetchConfigScreen(opts: {
  busy: boolean;
  onRun: () => void;
}): DrillScreen {
  return {
    title: "Fetch",
    render: () => <FetchConfigBody busy={opts.busy} onRun={opts.onRun} />,
  };
}
