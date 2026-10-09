import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ApplyClaudeLimits } from "../../bridge/commands";
import { accountLabel, skipChip } from "../claudePoolText";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { accountMeters } from "../sidebarUsage";
import { useAccountsStore } from "../store/accounts";
import {
  MAIN_POOL,
  pendingSuggestion,
  poolForProjectKey,
  useClaudePoolStore,
  type ClaudePool,
} from "../store/claudePool";
import { useSettingsStore } from "../store/settings";
import { ClaudeSwitchingRow, type SwitchingChip } from "./ClaudeSwitchingRow";
import { SettingsSection } from "./SettingsSection";
import { BTN_SECONDARY } from "./ui/buttons";
import { SegmentedControl } from "./ui/SegmentedControl";
import { Toggle } from "./ui/Toggle";

const MAIN_LOGIN = "default";

const UNAVAILABLE: Record<string, string> = {
  headless: "Not available on a headless host: there is no one here to confirm the accounts.",
  ambient:
    "lpm was opened with a Claude config folder set in its environment, so it can't tell your accounts apart. Remove it from your shell profile and reopen lpm.",
  profile:
    "Your shell profile sets a Claude config folder, which would override the account lpm picks. Remove it from your shell profile and reopen lpm.",
};

function chipsFor(id: string, pool: ClaudePool, dismissed: Record<string, string>): SwitchingChip[] {
  if (!pool.active) return [];
  const view = poolForProjectKey(pool, MAIN_POOL);
  if (!view) return [];
  const chips: SwitchingChip[] = [];
  if (view.current === id) chips.push({ text: "New sessions", tone: "claude" });
  else if (pendingSuggestion(pool, view, dismissed)?.id === id) chips.push({ text: "Suggested", tone: "muted" });
  const skip = view.pick?.skipped.find((s) => s.id === id)?.skip;
  if (skip && skip.kind !== "signedOut") chips.push(skipChip(skip));
  return chips;
}

/** Settings → Account switching: which accounts take turns for new Claude
 *  sessions, in what order, and whether lpm asks before moving on. */
export function ClaudeSwitchingSection() {
  const accounts = useAccountsStore((s) => s.accounts);
  const pool = useClaudePoolStore((s) => s.pool);
  const dismissed = useClaudePoolStore((s) => s.dismissed);
  const hydrate = useClaudePoolStore((s) => s.hydrate);
  const update = useClaudePoolStore((s) => s.update);
  const resume = useClaudePoolStore((s) => s.resume);
  const askConsent = useClaudePoolStore((s) => s.askConsent);
  const updateSettings = useSettingsStore((s) => s.update);
  const { limits } = useAgentLimits();
  const now = useNow(true, 60000);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void hydrate();
  }, [hydrate, accounts]);

  if (!pool || (accounts.length === 0 && !pool.enabled)) return null;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch {
      // The store already reported it.
    } finally {
      setBusy(false);
    }
  };

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

  const accountOf = (id: string) => pool.accounts.find((a) => a.id === id);
  const label = (id: string) => accountLabel(id, pool);
  const setMain = (main: string[]) => void run(() => update({ main }));
  const move = (i: number, d: -1 | 1) => {
    const next = [...pool.main];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setMain(next);
  };
  const full = pool.main.length >= pool.maxMembers;
  const others = [MAIN_LOGIN, ...accounts.map((a) => a.id)].filter((id) => !pool.main.includes(id));

  const addAction = (id: string) => {
    const account = accountOf(id);
    if (!account?.signedIn) return null;
    const personal = account.plan === "max" || account.plan === "pro";
    if (!personal && !pool.allowed.includes(id)) {
      return (
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy || full}
          title={full ? `Up to ${pool.maxMembers} accounts take turns` : undefined}
          onClick={() => askConsent({ patch: { allowed: [...pool.allowed, id], main: [...pool.main, id] } })}
        >
          Allow
        </button>
      );
    }
    return (
      <button
        type="button"
        className={BTN_SECONDARY}
        disabled={busy || full}
        title={full ? `Up to ${pool.maxMembers} accounts take turns` : undefined}
        onClick={() => askConsent({ patch: { main: [...pool.main, id] }, members: [id] })}
      >
        Add to list
      </button>
    );
  };

  const confirmAction = (id: string) =>
    pool.enabled && accountOf(id)?.signedIn && !accountOf(id)?.confirmed ? (
      <button
        type="button"
        className={BTN_SECONDARY}
        disabled={busy}
        onClick={() => askConsent({ patch: {}, members: [id] })}
      >
        Confirm
      </button>
    ) : null;

  const noteFor = (id: string) => {
    const account = accountOf(id);
    if (!account?.signedIn) return "Sign in first";
    const personal = account.plan === "max" || account.plan === "pro";
    if (!personal && !pool.allowed.includes(id)) {
      return "Not a personal Pro or Max plan. Its use counts against, and can be billed to, the organization that owns it.";
    }
    return undefined;
  };

  return (
    <SettingsSection
      id="ai.accountSwitching"
      title="Account switching"
      description="New Claude sessions start on the first account in the list that is under 90% of its 5-hour and weekly limits. Sessions already running stay on their account."
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-[var(--text-primary)]">Switch between accounts</div>
          <div className="text-[11px] text-[var(--text-muted)]">
            {pool.unavailable
              ? UNAVAILABLE[pool.unavailable]
              : pool.enabled
                ? "On. Projects set to a single account aren't affected."
                : "Off. Projects without their own account use your main login."}
          </div>
        </div>
        <Toggle
          enabled={pool.enabled}
          onChange={toggle}
          disabled={busy || (!!pool.unavailable && !pool.enabled)}
          aria-label="Switch between accounts"
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
        <div className="flex flex-wrap items-center gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[var(--text-primary)]">When an account gets close to a limit</div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {pool.mode === "ask"
                ? "lpm asks in the sidebar before new sessions move to the next account."
                : "New sessions move to the next account and lpm tells you."}
            </div>
          </div>
          <SegmentedControl
            ariaLabel="When an account gets close to a limit"
            value={pool.mode}
            options={[
              { value: "ask", label: "Ask me first" },
              { value: "auto", label: "Switch on its own" },
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
                ? `${label(pool.held ?? "")} was put on hold. lpm won't move sessions between accounts until you turn this back on. You can still choose an account for a project yourself.`
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

      <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">
        Takes turns, in this order
      </div>
      {pool.main.map((id, i) => (
        <ClaudeSwitchingRow
          key={id}
          label={label(id)}
          account={accountOf(id)}
          meters={accountMeters(limits, id, now)}
          chips={chipsFor(id, pool, dismissed)}
          note={noteFor(id)}
          move={{
            up: i > 0 ? () => move(i, -1) : undefined,
            down: i < pool.main.length - 1 ? () => move(i, 1) : undefined,
          }}
          action={
            <span className="flex gap-1.5">
              {confirmAction(id)}
              <button
                type="button"
                className={BTN_SECONDARY}
                disabled={busy || pool.main.length === 1}
                onClick={() => setMain(pool.main.filter((m) => m !== id))}
              >
                Remove
              </button>
            </span>
          }
        />
      ))}
      {others.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Not taking turns
          </div>
          {others.map((id) => (
            <ClaudeSwitchingRow
              key={id}
              label={label(id)}
              account={accountOf(id)}
              meters={[]}
              chips={[]}
              note={noteFor(id)}
              action={addAction(id)}
            />
          ))}
        </>
      )}
      <div className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
        Need more room on one account? Usage credits keep it going past its limit.
      </div>
    </SettingsSection>
  );
}
