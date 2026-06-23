import { useSettingsStore, saveSettings } from "../store/settings";
import {
  DEFAULT_PUSH_CONFIG,
  PUSH_MODES,
  PUSH_MODE_LABELS,
  type GitPushConfig,
  type PushMode,
} from "../gitOptions";
import { CheckIcon, ChevronRightIcon, UploadIcon } from "./icons";
import { MenuSplitRow } from "./MenuSplitRow";
import { FlagRow } from "./FlagRow";
import type { DrillApi, DrillScreen } from "./DrillMenu";

export function PushSplitRow({
  busy,
  onRun,
  onConfigure,
}: {
  busy: boolean;
  onRun: () => void;
  onConfigure: () => void;
}) {
  const cfg = useSettingsStore((s) => s.gitPush) ?? DEFAULT_PUSH_CONFIG;
  return (
    <MenuSplitRow
      icon={<UploadIcon />}
      label={PUSH_MODE_LABELS[cfg.mode]}
      onRun={onRun}
      onConfigure={onConfigure}
      disabled={busy}
    />
  );
}

function PushConfigBody({
  busy,
  onRun,
  onAdvanced,
}: {
  busy: boolean;
  onRun: () => void;
  onAdvanced: () => void;
}) {
  const cfg = useSettingsStore((s) => s.gitPush) ?? DEFAULT_PUSH_CONFIG;
  const setMode = (mode: PushMode) => void saveSettings({ gitPush: { ...cfg, mode } });
  return (
    <>
      <div className="px-4 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Default on click
      </div>
      {PUSH_MODES.map((m) => {
        const active = cfg.mode === m;
        return (
          <button
            key={m}
            onClick={() => setMode(m)}
            disabled={busy}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <span className="flex w-3.5 shrink-0">{active && <CheckIcon />}</span>
            <span className={active ? "text-[var(--text-primary)]" : ""}>
              {PUSH_MODE_LABELS[m]}
            </span>
          </button>
        );
      })}
      <div className="my-1 border-t border-[var(--border)]" />
      <button
        onClick={onAdvanced}
        className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        Advanced flags
        <span className="ml-auto flex text-[var(--text-muted)]">
          <ChevronRightIcon />
        </span>
      </button>
      <button
        onClick={onRun}
        disabled={busy}
        className="mt-1 flex w-full items-center justify-center px-4 py-2 text-[13px] font-medium text-[var(--accent-green)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-40"
      >
        Run push
      </button>
    </>
  );
}

function PushAdvancedBody({ busy }: { busy: boolean }) {
  const cfg = useSettingsStore((s) => s.gitPush) ?? DEFAULT_PUSH_CONFIG;
  const patch = (p: Partial<GitPushConfig>) =>
    void saveSettings({ gitPush: { ...cfg, ...p } });
  return (
    <>
      <FlagRow
        label="No verify"
        flag="--no-verify"
        checked={cfg.noVerify}
        onToggle={() => patch({ noVerify: !cfg.noVerify })}
        disabled={busy}
      />
      <FlagRow
        label="Push tags"
        flag="--tags"
        checked={cfg.tags}
        onToggle={() => patch({ tags: !cfg.tags })}
        disabled={busy}
      />
    </>
  );
}

export function pushConfigScreen(opts: { busy: boolean; onRun: () => void }): DrillScreen {
  return {
    title: "Push",
    render: (api: DrillApi) => (
      <PushConfigBody
        busy={opts.busy}
        onRun={opts.onRun}
        onAdvanced={() =>
          api.push({
            title: "Push · Advanced",
            render: () => <PushAdvancedBody busy={opts.busy} />,
          })
        }
      />
    ),
  };
}
