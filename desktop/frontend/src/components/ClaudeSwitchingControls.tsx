import { accountLabel } from "../claudePoolText";
import { rowProps } from "../settings-registry";
import type { ClaudePool } from "../store/claudePool";
import { SettingsRow } from "./SettingsRow";
import type { ClaudeAccountsSource } from "./settings/useClaudeAccountsSource";
import { useClaudeReadings } from "./settings/useClaudeReadings";
import { BTN_SECONDARY } from "./ui/buttons";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Toggle } from "./ui/Toggle";

const UNAVAILABLE: Record<string, string> = {
  headless: "Not available on a headless host: there is no one here to confirm the accounts.",
  ambient:
    "lpm was opened with a Claude config folder set in its environment, so it can't tell your accounts apart. Remove it from your shell profile and reopen lpm.",
  profile:
    "Your shell profile sets a Claude config folder, which would override the account lpm picks. Remove it from your shell profile and reopen lpm.",
};

const SWITCHING_OFF = "Turn on Switch accounts automatically to use this";

interface ClaudeSwitchingControlsProps {
  pool: ClaudePool;
  source: ClaudeAccountsSource;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}

function statusLine(pool: ClaudePool): string {
  if (pool.unavailable) return UNAVAILABLE[pool.unavailable];
  if (!pool.enabled) return "Off. Projects without their own account use your main login.";
  return `New sessions start on the first account in turn order that is under ${pool.switchAt}% of its 5-hour and weekly limits. Sessions already running stay on their account.`;
}

/** Settings › Accounts & usage › Claude: the switch that lets accounts take
 *  turns, why it's held back, and what happens near a limit. */
export function ClaudeSwitchingControls({ pool, source, busy, run }: ClaudeSwitchingControlsProps) {
  const { updatePool, resumePool, askConsent } = source;
  const setReadings = useClaudeReadings();

  // Turning on always asks: it confirms every account that will take turns,
  // including ones added to a project's own list while switching was off.
  const toggle = () => {
    if (pool.enabled) return void run(() => updatePool({ enabled: false }));
    askConsent({ patch: { enabled: true } });
  };

  return (
    <>
      <SettingsRow
        {...rowProps("ai.accountSwitching")}
        below={
          <p
            className={`mt-1 text-[11px] leading-relaxed ${
              pool.unavailable ? "text-[var(--accent-amber-text)]" : "text-[var(--text-secondary)]"
            }`}
          >
            {statusLine(pool)}
          </p>
        }
        details={<p>Need more room on one account? Usage credits keep it going past its limit.</p>}
      >
        <Toggle
          enabled={pool.enabled}
          onChange={toggle}
          disabled={busy || (!!pool.unavailable && !pool.enabled)}
          aria-label="Switch accounts automatically"
        />
      </SettingsRow>

      {pool.enabled && !pool.consented && !pool.unavailable && (
        <div className="flex flex-wrap items-center gap-4 bg-[color-mix(in_srgb,var(--accent-amber)_8%,transparent)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--text-primary)]">Confirm your accounts again</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              The notice about switching changed. New sessions use your main login until you confirm.
            </div>
          </div>
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy}
            onClick={() => askConsent({ patch: { enabled: true } })}
          >
            Review
          </button>
        </div>
      )}

      {pool.enabled && pool.paused && (
        <div className="flex flex-wrap items-center gap-4 bg-[color-mix(in_srgb,var(--accent-red)_7%,transparent)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--text-primary)]">Switching is paused</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {pool.paused === "hold"
                ? `${accountLabel(pool.held ?? "", pool, source.accounts)} was put on hold. lpm won't move sessions between accounts until you turn this back on. You can still choose an account for a project yourself.`
                : "Read Claude usage is off, so lpm can't tell when an account is close to a limit."}
            </div>
          </div>
          {pool.paused === "hold" ? (
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void run(resumePool)}>
              Hold lifted? Turn back on
            </button>
          ) : (
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void run(() => setReadings(true))}>
              Turn on Read Claude usage
            </button>
          )}
        </div>
      )}

      <SettingsRow label="Before switching" description={pool.enabled ? "Ask me first, or switch on its own" : SWITCHING_OFF}>
        <SegmentedControl
          ariaLabel="Before switching"
          value={pool.mode}
          options={[
            {
              value: "ask",
              label: "Ask me first",
              tooltip: "lpm asks in the sidebar before new sessions move to the next account.",
              disabled: !pool.enabled,
            },
            {
              value: "auto",
              label: "Switch on its own",
              tooltip: "New sessions move to the next account and lpm tells you.",
              disabled: !pool.enabled,
            },
          ]}
          onChange={(mode) => void run(() => updatePool({ mode }))}
        />
      </SettingsRow>
    </>
  );
}
