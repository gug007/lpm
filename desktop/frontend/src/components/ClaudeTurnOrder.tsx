import { useState, type ComponentProps, type ReactNode } from "react";
import { MAIN_LOGIN, accountLabel, skipChip } from "../claudePoolText";
import { MAIN_POOL, pendingSuggestion, poolForProjectKey, type ClaudePool } from "../store/claudePool";
import { ClaudeAccountListRow, type AccountChip } from "./ClaudeAccountListRow";
import { ClaudeSortableAccountRow } from "./ClaudeSortableAccountRow";
import { SettingsRow } from "./SettingsRow";
import type { ClaudeAccountsSource } from "./settings/useClaudeAccountsSource";
import { BTN_SECONDARY } from "./ui/buttons";
import { SortableList } from "./ui/SortableList";
import { Toggle } from "./ui/Toggle";

export type ClaudeAccountSummary = Pick<
  ComponentProps<typeof ClaudeAccountListRow>,
  "label" | "signedIn" | "planLabel" | "detail"
>;

const ORG_NOTE =
  "Not a personal Pro or Max plan. Its use counts against, and can be billed to, the organization that owns it.";
const HEADING = "px-4 pt-3 pb-1 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--text-muted)]";

function chipsFor(id: string, pool: ClaudePool, dismissed: Record<string, string>): AccountChip[] {
  if (!pool.active) return [];
  const view = poolForProjectKey(pool, MAIN_POOL);
  if (!view) return [];
  const chips: AccountChip[] = [];
  if (view.current === id) chips.push({ text: "New sessions", tone: "claude" });
  else if (pendingSuggestion(pool, view, dismissed)?.id === id) chips.push({ text: "Suggested", tone: "muted" });
  const skip = view.pick?.skipped.find((s) => s.id === id)?.skip;
  if (skip && skip.kind !== "signedOut") chips.push(skipChip(skip));
  return chips;
}

interface ClaudeTurnOrderProps {
  pool: ClaudePool;
  source: ClaudeAccountsSource;
  busy: boolean;
  run: (fn: () => Promise<void>) => Promise<void>;
  account: (id: string) => ClaudeAccountSummary;
  signInButton: (id: string) => ReactNode;
}

/** Settings › Accounts & usage › Turn order: which accounts new sessions take
 *  turns across, first to last. Shown, but out of reach, while switching is off. */
export function ClaudeTurnOrder({ pool, source, busy, run, account, signInButton }: ClaudeTurnOrderProps) {
  const { accounts, dismissed, askConsent } = source;
  const [pendingMain, setPendingMain] = useState<string[] | null>(null);
  const main = pendingMain ?? pool.main;
  const others = [MAIN_LOGIN, ...accounts.map((a) => a.id)].filter((id) => !main.includes(id));

  // The list shows the new order right away instead of snapping back while it saves.
  const setMain = (next: string[]) => {
    setPendingMain(next);
    void run(() => source.updatePool({ main: next })).finally(() => setPendingMain(null));
  };

  const poolAccount = (id: string) => pool.accounts.find((a) => a.id === id);
  const notAllowed = (id: string) => {
    const plan = poolAccount(id)?.plan;
    return plan !== undefined && plan !== "max" && plan !== "pro" && !pool.allowed.includes(id);
  };
  const summary = (id: string): ClaudeAccountSummary => {
    const base = account(id);
    return base.signedIn && notAllowed(id) ? { ...base, detail: ORG_NOTE } : base;
  };
  const toggleLabel = (id: string) => `${accountLabel(id, pool, accounts)} takes turns`;

  const memberActions = (id: string) => {
    const last = main.length === 1;
    return (
      <>
        {signInButton(id)}
        {poolAccount(id)?.signedIn && !poolAccount(id)?.confirmed && (
          <button
            type="button"
            className={BTN_SECONDARY}
            disabled={busy}
            onClick={() => askConsent({ patch: {}, members: [id] })}
          >
            Confirm
          </button>
        )}
        <span className="flex" title={last ? "At least one account takes turns" : undefined}>
          <Toggle
            enabled
            onChange={() => setMain(main.filter((m) => m !== id))}
            disabled={busy || last}
            aria-label={toggleLabel(id)}
          />
        </span>
      </>
    );
  };

  const otherActions = (id: string) => {
    if (!account(id).signedIn) return signInButton(id);
    const full = pool.main.length >= pool.maxMembers;
    const fullTitle = full ? `Up to ${pool.maxMembers} accounts take turns` : undefined;
    if (notAllowed(id)) {
      return (
        <button
          type="button"
          className={BTN_SECONDARY}
          disabled={busy || full}
          title={fullTitle}
          onClick={() => askConsent({ patch: { allowed: [...pool.allowed, id], main: [...pool.main, id] } })}
        >
          Allow
        </button>
      );
    }
    return (
      <span className="flex" title={fullTitle}>
        <Toggle
          enabled={false}
          onChange={() => askConsent({ patch: { main: [...pool.main, id] }, members: [id] })}
          disabled={busy || full}
          aria-label={toggleLabel(id)}
        />
      </span>
    );
  };

  const move = (i: number, delta: -1 | 1) => {
    const j = i + delta;
    if (j < 0 || j >= main.length) return;
    const next = [...main];
    [next[i], next[j]] = [next[j], next[i]];
    setMain(next);
  };

  return (
    <>
      <SettingsRow
        label="Turn order"
        description={
          pool.enabled
            ? "Drag to choose which account goes next. Turn one off to leave it out"
            : "Turn on Switch accounts automatically to use this"
        }
      >
        {null}
      </SettingsRow>
      <div inert={!pool.enabled} aria-disabled={!pool.enabled} className={pool.enabled ? undefined : "opacity-50"}>
        <SortableList ids={main} onReorder={setMain}>
          {main.map((id, i) => (
            <ClaudeSortableAccountRow
              key={id}
              id={id}
              {...summary(id)}
              meters={[]}
              order={i + 1}
              chips={chipsFor(id, pool, dismissed)}
              actions={memberActions(id)}
              onMove={(delta) => move(i, delta)}
              disabled={!pool.enabled || main.length < 2}
            />
          ))}
        </SortableList>
        {others.length > 0 && (
          <div>
            <div className={HEADING}>Not taking turns</div>
            {others.map((id) => (
              <ClaudeAccountListRow
                key={id}
                {...summary(id)}
                meters={[]}
                chips={[]}
                indent
                actions={otherActions(id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
