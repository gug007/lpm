import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { ApplyClaudeLimits } from "../../bridge/commands";
import { useAgentLimits, pickProvider } from "../hooks/useAgentLimits";
import type { ProviderLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { useSettingsStore } from "../store/settings";
import { useAccountsStore } from "../store/accounts";
import { providerMeta } from "./stats/limitsFormat";
import { UsageProviderCard } from "./UsageProviderCard";
import { UsageEmptyPanel } from "./UsageEmptyPanel";
import { UsageSkeleton } from "./UsageSkeleton";
import { ConfirmDialog } from "./ui/ConfirmDialog";

interface ClaudeCard {
  key: string;
  data: ProviderLimits;
  title: string;
  subtitle?: string;
}

interface UsageViewProps {
  onClose?: () => void;
}

export function UsageView({ onClose }: UsageViewProps) {
  const { limits: map, loading, error, refresh } = useAgentLimits();
  const now = useNow(true, 30_000);
  const enabled = useSettingsStore((s) => s.claudeLimitsEnabled ?? false);
  const update = useSettingsStore((s) => s.update);
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const hydrateAccounts = useAccountsStore((s) => s.hydrate);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  useEffect(() => {
    void hydrateAccounts();
  }, [hydrateAccounts]);

  const claudeCards = useMemo<ClaudeCard[]>(() => {
    if (!enabled) return [];
    return Object.entries(map)
      .filter(([, v]) => v.provider === "claude")
      .map(([key, data]) => {
        const id = data.accountId;
        if (!id || id === "default") {
          const email = statuses["default"]?.email;
          return { key, data, title: "Claude", subtitle: email || undefined };
        }
        const label = accounts.find((a) => a.id === id)?.label;
        const email = statuses[id]?.email;
        return {
          key,
          data,
          title: label || id,
          subtitle: email || (label ? id : undefined),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title) || a.key.localeCompare(b.key));
  }, [enabled, map, accounts, statuses]);

  const codex = pickProvider(map, "codex");
  const showClaudeEnable = claudeCards.length === 0 && !enabled;
  const showClaudeWaiting = claudeCards.length === 0 && enabled;
  const hasSnapshot = Object.keys(map).length > 0;

  // Persist only after the backend actually applied the change, so a failed
  // install can never leave the setting on with nothing behind it.
  const setClaudeLimits = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await ApplyClaudeLimits(next);
      await update({ claudeLimitsEnabled: next });
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
          onClick={() => void refresh()}
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
              {claudeCards.map((c) => (
                <UsageProviderCard
                  key={c.key}
                  data={c.data}
                  now={now}
                  title={c.title}
                  subtitle={c.subtitle}
                />
              ))}

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
                <UsageProviderCard data={codex} now={now} title="Codex" />
              ) : (
                <UsageEmptyPanel dot={providerMeta("codex").dot} dim name="Codex">
                  <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                    Codex usage appears here automatically the first time you run Codex in a
                    project.
                  </p>
                </UsageEmptyPanel>
              )}
            </div>
          </div>
        )}
      </div>

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
