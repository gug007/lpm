import { useSettingsStore, saveSettings } from "../store/settings";
import {
  DEFAULT_PULL_CONFIG,
  PULL_STRATEGIES,
  PULL_STRATEGY_LABELS,
  type GitPullConfig,
  type PullStrategy,
} from "../gitOptions";
import { CheckIcon, ChevronRightIcon, DownloadIcon } from "./icons";
import { MenuSplitRow } from "./MenuSplitRow";
import { FlagRow } from "./FlagRow";
import type { DrillApi, DrillScreen } from "./DrillMenu";

export function PullSplitRow({
  busy,
  onRun,
  onConfigure,
}: {
  busy: boolean;
  onRun: () => void;
  onConfigure: () => void;
}) {
  const cfg = useSettingsStore((s) => s.gitPull) ?? DEFAULT_PULL_CONFIG;
  return (
    <MenuSplitRow
      icon={<DownloadIcon />}
      label={PULL_STRATEGY_LABELS[cfg.strategy]}
      onRun={onRun}
      onConfigure={onConfigure}
      disabled={busy}
    />
  );
}

function PullConfigBody({
  busy,
  onRun,
  onAdvanced,
}: {
  busy: boolean;
  onRun: () => void;
  onAdvanced: () => void;
}) {
  const cfg = useSettingsStore((s) => s.gitPull) ?? DEFAULT_PULL_CONFIG;
  const setStrategy = (strategy: PullStrategy) =>
    void saveSettings({ gitPull: { ...cfg, strategy } });
  return (
    <>
      <div className="px-4 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Default on click
      </div>
      {PULL_STRATEGIES.map((s) => {
        const active = cfg.strategy === s;
        return (
          <button
            key={s}
            onClick={() => setStrategy(s)}
            disabled={busy}
            className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <span className="flex w-3.5 shrink-0">
              {active && <CheckIcon />}
            </span>
            <span className={active ? "text-[var(--text-primary)]" : ""}>
              {PULL_STRATEGY_LABELS[s]}
            </span>
          </button>
        );
      })}
      <div className="mx-3 my-1 border-t border-[var(--border)]" />
      <button
        onClick={onAdvanced}
        className="mx-1.5 flex w-[calc(100%-12px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        Advanced flags
        <span className="ml-auto flex text-[var(--text-muted)]">
          <ChevronRightIcon />
        </span>
      </button>
      <button
        onClick={onRun}
        disabled={busy}
        className="mx-1.5 mt-1 flex w-[calc(100%-12px)] items-center justify-center rounded-lg px-2.5 py-2 text-[13px] font-medium text-[var(--accent-green)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
      >
        Run pull
      </button>
    </>
  );
}

function PullAdvancedBody({ busy }: { busy: boolean }) {
  const cfg = useSettingsStore((s) => s.gitPull) ?? DEFAULT_PULL_CONFIG;
  const patch = (p: Partial<GitPullConfig>) =>
    void saveSettings({ gitPull: { ...cfg, ...p } });
  return (
    <>
      <FlagRow
        label="Autostash"
        flag="--autostash"
        checked={cfg.autostash}
        onToggle={() => patch({ autostash: !cfg.autostash })}
        disabled={busy}
      />
      <FlagRow
        label="No verify"
        flag="--no-verify"
        checked={cfg.noVerify}
        onToggle={() => patch({ noVerify: !cfg.noVerify })}
        disabled={busy}
      />
    </>
  );
}

export function pullConfigScreen(opts: {
  busy: boolean;
  onRun: () => void;
}): DrillScreen {
  return {
    title: "Pull",
    render: (api: DrillApi) => (
      <PullConfigBody
        busy={opts.busy}
        onRun={opts.onRun}
        onAdvanced={() =>
          api.push({
            title: "Pull · Advanced",
            render: () => <PullAdvancedBody busy={opts.busy} />,
          })
        }
      />
    ),
  };
}
