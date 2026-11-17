import {
  FETCH_OPTIONS,
  PULL_STRATEGIES,
  PULL_STRATEGY_SETTING_LABELS,
  PUSH_MODES,
  PUSH_MODE_SETTING_LABELS,
  normalizeGitFetch,
  normalizeGitPull,
  normalizeGitPush,
  type GitFetchConfig,
  type GitPullConfig,
  type GitPushConfig,
  type PullStrategy,
  type PushMode,
} from "../../gitOptions";
import { rowProps } from "../../settings-registry";
import { SettingsRow } from "../SettingsRow";
import { SettingsSection } from "../SettingsSection";
import { SettingsSelect } from "../SettingsSelect";
import { Toggle } from "../ui/Toggle";
import { SettingsCheckbox } from "./SettingsCheckbox";
import { useRowReach, useSettingsTarget } from "./settingsTarget";

const CHECK_GRID = "grid grid-cols-2 gap-x-6 gap-y-2";

// Getting on the left and removing on the right, branches above tags.
const FETCH_ORDER: (keyof GitFetchConfig)[] = ["all", "prune", "tags", "pruneTags"];
const FETCH_CHOICES = FETCH_ORDER.flatMap((key) => FETCH_OPTIONS.filter((o) => o.key === key));

const PULL_DESCRIPTIONS: Record<PullStrategy, string> = {
  ff: "Merges when both sides have changed. The Pull menu uses this too",
  "ff-only": "Never merges: stops if both sides have changed. The Pull menu uses this too",
  rebase: "Replays your commits on top of the remote's. The Pull menu uses this too",
};

const PUSH_DESCRIPTIONS: Record<PushMode, string> = {
  default: "Stops if the remote has commits you don't. The Push menu uses this too",
  "force-with-lease":
    "Overwrites the remote branch, but only if nobody pushed to it since your last fetch. The Push menu uses this too",
};

// The defaults the Pull, Push and Fetch menus remember, kept as whole objects
// so a machine stores exactly what those menus would.
export function GitCommandsSection() {
  const { settings, update } = useSettingsTarget();
  const shows = useRowReach();
  const pull = normalizeGitPull(settings.gitPull);
  const push = normalizeGitPush(settings.gitPush);
  const fetchConfig = normalizeGitFetch(settings.gitFetch);

  const setPull = (patch: Partial<GitPullConfig>) => void update({ gitPull: { ...pull, ...patch } });
  const setPush = (patch: Partial<GitPushConfig>) => void update({ gitPush: { ...push, ...patch } });
  const setFetch = (patch: Partial<GitFetchConfig>) => void update({ gitFetch: { ...fetchConfig, ...patch } });

  return (
    <SettingsSection title="Pull, push and fetch">
      {shows("git.pullStrategy") && (
        <SettingsRow {...rowProps("git.pullStrategy", { description: PULL_DESCRIPTIONS[pull.strategy] })}>
          <SettingsSelect
            aria-label="When pulling"
            value={pull.strategy}
            onChange={(e) => setPull({ strategy: e.target.value as PullStrategy })}
          >
            {PULL_STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {PULL_STRATEGY_SETTING_LABELS[s]}
              </option>
            ))}
          </SettingsSelect>
        </SettingsRow>
      )}
      {shows("git.pullAutostash") && (
        <SettingsRow {...rowProps("git.pullAutostash")}>
          <Toggle
            aria-label="Stash my changes before pulling"
            enabled={pull.autostash}
            onChange={(autostash) => setPull({ autostash })}
          />
        </SettingsRow>
      )}
      {shows("git.pushMode") && (
        <SettingsRow {...rowProps("git.pushMode", { description: PUSH_DESCRIPTIONS[push.mode] })}>
          <SettingsSelect
            aria-label="When pushing"
            value={push.mode}
            onChange={(e) => setPush({ mode: e.target.value as PushMode })}
          >
            {PUSH_MODES.map((m) => (
              <option key={m} value={m}>
                {PUSH_MODE_SETTING_LABELS[m]}
              </option>
            ))}
          </SettingsSelect>
        </SettingsRow>
      )}
      {shows("git.pushTags") && (
        <SettingsRow {...rowProps("git.pushTags")}>
          <Toggle aria-label="Push tags too" enabled={push.tags} onChange={(tags) => setPush({ tags })} />
        </SettingsRow>
      )}
      {shows("git.skipHooks") && (
        <SettingsRow {...rowProps("git.skipHooks")} stacked>
          <div role="group" aria-label="Skip Git hooks" className={CHECK_GRID}>
            <SettingsCheckbox
              label="When pushing"
              title="git push --no-verify"
              checked={push.noVerify}
              onChange={(noVerify) => setPush({ noVerify })}
            />
            <SettingsCheckbox
              label="When pulling"
              title="git pull --no-verify"
              checked={pull.noVerify}
              onChange={(noVerify) => setPull({ noVerify })}
            />
          </div>
        </SettingsRow>
      )}
      {shows("git.fetchOptions") && (
        <SettingsRow {...rowProps("git.fetchOptions")} stacked>
          <div role="group" aria-label="When fetching" className={CHECK_GRID}>
            {FETCH_CHOICES.map((o) => (
              <SettingsCheckbox
                key={o.key}
                label={o.label}
                title={`git fetch ${o.flag}`}
                checked={fetchConfig[o.key]}
                onChange={(on) => setFetch({ [o.key]: on })}
              />
            ))}
          </div>
        </SettingsRow>
      )}
    </SettingsSection>
  );
}
