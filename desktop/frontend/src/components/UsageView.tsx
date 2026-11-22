import { useEffect, useMemo, useState } from "react";
import { StartClaudeLogin } from "../../bridge/commands";
import { LoaderCircle, RefreshCw, X } from "lucide-react";
import { toast } from "../notifications/toast";
import { setClaudeLimitsEnabled } from "../claudeLimits";
import { useAgentLimits, pickProvider } from "../hooks/useAgentLimits";
import { useUsageReads } from "../hooks/useUsageReads";
import { useLimitReminders } from "../hooks/useLimitReminders";
import type { ProviderLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { useTokensToday } from "../hooks/useTokensToday";
import { useSettingsStore } from "../store/settings";
import { useAccountsStore, type ClaudeAccountStatus } from "../store/accounts";
import { tokensToday } from "../sidebarUsage";
import { providerMeta } from "./stats/limitsFormat";
import { UsageProviderCard } from "./UsageProviderCard";
import { UsageEmptyPanel } from "./UsageEmptyPanel";
import { UsageAccountWaiting } from "./UsageAccountWaiting";
import { UsageSkeleton } from "./UsageSkeleton";
import { UsageSidebarSection } from "./UsageSidebarSection";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { UsageSameLoginCard } from "./UsageSameLoginCard";
import { ClaudeLoginModal } from "./ClaudeLoginModal";
import type { ClaudeAccount } from "../types";

interface ClaudeCard {
  key: string;
  data: ProviderLimits;
  title: string;
  subtitle?: string;
  account: string;
}

const MAIN_TITLE = "Claude";

function titleOf(id: string, accounts: ClaudeAccount[]): string {
  return id === "default" ? MAIN_TITLE : accounts.find((a) => a.id === id)?.label || id;
}

// The profiles signed in as the same account as `id`, which its card speaks for.
function alsoOn(id: string, accounts: ClaudeAccount[], statuses: Record<string, ClaudeAccountStatus>): string[] {
  return Object.entries(statuses)
    .filter(([, s]) => s.sameAs === id)
    .map(([other]) => titleOf(other, accounts));
}

interface UsageViewProps {
  onClose?: () => void;
}

export function UsageView({ onClose }: UsageViewProps) {
  const { limits: map, loading, error, refresh } = useAgentLimits();
  const reminders = useLimitReminders();
  const now = useNow(true, 30_000);
  const enabled = useSettingsStore((s) => s.claudeLimitsEnabled ?? false);
  const { stats: todayStats } = useTokensToday();
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const pinned = useAccountsStore((s) => s.usage);
  const hydrateAccounts = useAccountsStore((s) => s.hydrate);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [loginAccount, setLoginAccount] = useState<ClaudeAccount | null>(null);
  const reads = useUsageReads(map, refresh);

  useEffect(() => {
    void hydrateAccounts();
  }, [hydrateAccounts]);

  const claudeCards = useMemo<ClaudeCard[]>(() => {
    if (!enabled) return [];
    return Object.entries(map)
      .filter(([, v]) => v.provider === "claude")
      .map(([key, data]) => {
        const id = data.accountId || "default";
        const also = alsoOn(id, accounts, statuses);
        const withAlso = (text?: string) =>
          also.length ? [text, `also on ${also.join(", ")}`].filter(Boolean).join(" · ") : text;
        const email = statuses[id]?.email;
        const named = id !== "default" && !!accounts.find((a) => a.id === id)?.label;
        return {
          key,
          data,
          title: titleOf(id, accounts),
          subtitle: withAlso(email || (named ? id : undefined)),
          account: id,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  }, [enabled, map, accounts, statuses]);

  // An account the user added but has not run yet still gets a panel, so a
  // second account never looks like it went missing.
  const waitingAccounts = useMemo(() => {
    if (!enabled) return [];
    const reported = new Set(claudeCards.map((c) => c.data.accountId).filter(Boolean));
    return accounts.filter((a) => !reported.has(a.id));
  }, [enabled, claudeCards, accounts]);

  const spentToday = useMemo(() => tokensToday(todayStats), [todayStats]);

  const codex = pickProvider(map, "codex");
  const showClaudeEnable = claudeCards.length === 0 && !enabled;
  const showClaudeWaiting = claudeCards.length === 0 && waitingAccounts.length === 0 && enabled;
  const hasSnapshot = Object.keys(map).length > 0;

  // Only an added account signs in here; the main login is Claude Code's own.
  const signInAgain = (id: string) => {
    const account = accounts.find((a) => a.id === id);
    return account ? () => setLoginAccount(account) : undefined;
  };

  // A profile signed in as an earlier one's account, which that card speaks for.
  const sameLoginCard = (id: string, key: string, name: string) => {
    const sameAs = statuses[id]?.sameAs;
    if (!sameAs) return null;
    return (
      <UsageSameLoginCard
        key={key}
        name={name}
        email={statuses[id]?.email}
        sameAsName={titleOf(sameAs, accounts)}
        onSignIn={signInAgain(id)}
      />
    );
  };

  const setClaudeLimits = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await setClaudeLimitsEnabled(next);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-4 py-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Usage</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Live plan usage for your AI coding tools
          </p>
        </div>
        {enabled && (
          <button
            type="button"
            onClick={() => setConfirmDisable(true)}
            disabled={busy}
            className="flex h-8 items-center rounded-md border border-[var(--border)] px-3 text-xs font-medium text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-50"
          >
            Turn off Claude usage
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            void hydrateAccounts();
            void reads.refresh();
          }}
          disabled={loading}
          aria-label="Refresh usage"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-50"
        >
          {loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close usage"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors duration-[120ms] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {reads.note && (
        <p role="status" className="mt-2 text-xs text-[var(--text-muted)]">
          {reads.note}
        </p>
      )}

      <div className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto">
        {error && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-[var(--accent-red)]/30 bg-[var(--accent-red)]/8 px-4 py-3 text-sm text-[var(--accent-red-text)]">
            <span>Could not load usage limits: {error}</span>
            <button
              onClick={() => void refresh()}
              className="shrink-0 rounded font-medium underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)]"
            >
              Try again
            </button>
          </div>
        )}

        {!error && loading && !hasSnapshot && <UsageSkeleton />}

        {(!loading || hasSnapshot) && (
          <div
            className="space-y-4 pb-2 transition-opacity duration-200"
            style={{ opacity: loading ? 0.6 : 1 }}
          >
            <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(360px,1fr))]">
              {claudeCards.map((c) =>
                sameLoginCard(c.account, c.key, c.title) ??
                (c.data.noLimits ? (
                  <UsageEmptyPanel key={c.key} dot={providerMeta("claude").dot} name={c.title}>
                    <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                      Claude is running on this account, but its plan has no 5-hour or weekly
                      limits to show.
                    </p>
                  </UsageEmptyPanel>
                ) : (
                  <UsageProviderCard
                    key={c.key}
                    data={c.data}
                    now={now}
                    title={c.title}
                    subtitle={c.subtitle}
                    reminders={reminders}
                    limitKey={c.key}
                    reader={
                      statuses[c.account]?.signedIn === false
                        ? undefined
                        : {
                            busy: !!reads.busy[c.account],
                            error: reads.errors[c.account],
                            onRead: () => void reads.read(c.account),
                          }
                    }
                  />
                )),
              )}

              {waitingAccounts.map(
                (account) =>
                  sameLoginCard(account.id, account.id, account.label) ?? (
                    <UsageAccountWaiting
                      key={account.id}
                      name={account.label}
                      signedIn={statuses[account.id]?.signedIn ?? true}
                      projects={pinned[account.id] ?? []}
                    />
                  ),
              )}

              {showClaudeEnable && (
                <UsageEmptyPanel dot={providerMeta("claude").dot} name="Claude">
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Turn on Claude usage to see how much of your plan you've used in the current
                    5-hour and weekly windows. Your existing setup stays exactly as it is.
                  </p>
                  <button
                    type="button"
                    onClick={() => void setClaudeLimits(true)}
                    disabled={busy}
                    className="mt-3 w-fit rounded-md bg-[var(--accent-green)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent-blue)] disabled:opacity-50"
                  >
                    {busy ? "Turning on…" : "Enable"}
                  </button>
                </UsageEmptyPanel>
              )}

              {showClaudeWaiting && (
                <UsageEmptyPanel dot={providerMeta("claude").dot} dim name="Claude">
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Waiting for a Claude session. Your usage appears here as soon as you run Claude
                    in a project.
                  </p>
                </UsageEmptyPanel>
              )}

              {codex ? (
                <UsageProviderCard
                  data={codex}
                  now={now}
                  title="Codex"
                  reminders={reminders}
                  limitKey="codex"
                />
              ) : (
                <UsageEmptyPanel dot={providerMeta("codex").dot} dim name="Codex">
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Codex usage appears here automatically the first time you run Codex in a
                    project.
                  </p>
                </UsageEmptyPanel>
              )}
            </div>

            <UsageSidebarSection tokensToday={spentToday} />
          </div>
        )}
      </div>

      {loginAccount && (
        <ClaudeLoginModal
          account={loginAccount}
          startLogin={(id) => StartClaudeLogin(id)}
          status={{
            signedIn: statuses[loginAccount.id]?.signedIn ?? false,
            email: statuses[loginAccount.id]?.email ?? "",
            planLabel: "",
          }}
          refresh={hydrateAccounts}
          onClose={() => {
            setLoginAccount(null);
            void reads.refresh();
          }}
        />
      )}

      <ConfirmDialog
        open={confirmDisable}
        title="Turn off Claude usage"
        confirmLabel="Turn off"
        variant="destructive"
        disabled={busy}
        body={
          <>
            Claude usage meters stop updating and the Claude cards disappear. Codex usage is
            unaffected, and you can turn this back on at any time.
          </>
        }
        onCancel={() => setConfirmDisable(false)}
        onConfirm={() => {
          setConfirmDisable(false);
          void setClaudeLimits(false);
        }}
      />
    </div>
  );
}
