import { toast } from "sonner";
import { ApplyClaudeLimits } from "../../bridge/commands";
import { accountLabel } from "../claudePoolText";
import { useClaudePoolStore, type ClaudePool } from "../store/claudePool";
import { useSettingsStore } from "../store/settings";
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

interface ClaudeSwitchingControlsProps {
  pool: ClaudePool;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
}

/** The switching rows at the top of Settings → Claude accounts: the on/off
 *  switch, what happens near a limit, and why switching is held back. */
export function ClaudeSwitchingControls({ pool, busy, run }: ClaudeSwitchingControlsProps) {
  const hydrate = useClaudePoolStore((s) => s.hydrate);
  const update = useClaudePoolStore((s) => s.update);
  const resume = useClaudePoolStore((s) => s.resume);
  const askConsent = useClaudePoolStore((s) => s.askConsent);
  const updateSettings = useSettingsStore((s) => s.update);

  // Turning on always asks: it confirms every account that will take turns,
  // including ones added to a project's own list while switching was off.
  const toggle = () => {
    if (pool.enabled) return void run(() => update({ enabled: false }));
    askConsent({ patch: { enabled: true } });
  };

  const turnOnReadings = () =>
    run(async () => {
      try {
        await ApplyClaudeLimits(true);
        await updateSettings({ claudeLimitsEnabled: true });
      } catch (err) {
        toast.error(String(err));
      }
      await hydrate();
    });

  return (
    <>
      <div className="flex items-center gap-4 px-4 py-3" data-settings-row="ai.accountSwitching">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)]">Switch accounts automatically</div>
          <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            {pool.unavailable
              ? UNAVAILABLE[pool.unavailable]
              : pool.enabled
                ? `New sessions start on the first account in rotation that is under ${pool.switchAt}% of its 5-hour and weekly limits. Sessions already running stay on their account.`
                : "Off. Projects without their own account use your main login."}
          </div>
        </div>
        <Toggle
          enabled={pool.enabled}
          onChange={toggle}
          disabled={busy || (!!pool.unavailable && !pool.enabled)}
          aria-label="Switch accounts automatically"
        />
      </div>

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

      {pool.enabled && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-2.5">
          <div className="min-w-0 flex-1 text-[12px] text-[var(--text-secondary)]">Before moving on</div>
          <SegmentedControl
            ariaLabel="Before moving on"
            value={pool.mode}
            options={[
              { value: "ask", label: "Ask me first", tooltip: "lpm asks in the sidebar before new sessions move to the next account." },
              { value: "auto", label: "Switch on its own", tooltip: "New sessions move to the next account and lpm tells you." },
            ]}
            onChange={(mode) => void run(() => update({ mode }))}
          />
        </div>
      )}

      {pool.enabled && pool.paused && (
        <div className="flex flex-wrap items-center gap-4 bg-[color-mix(in_srgb,var(--accent-red)_7%,transparent)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--text-primary)]">Switching is paused</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {pool.paused === "hold"
                ? `${accountLabel(pool.held ?? "", pool)} was put on hold. lpm won't move sessions between accounts until you turn this back on. You can still choose an account for a project yourself.`
                : "Usage readings are off, so lpm can't tell when an account is close to a limit."}
            </div>
          </div>
          {pool.paused === "hold" ? (
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void run(resume)}>
              Hold lifted? Turn back on
            </button>
          ) : (
            <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => void turnOnReadings()}>
              Turn on usage readings
            </button>
          )}
        </div>
      )}
    </>
  );
}
