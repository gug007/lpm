import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { AgentUsageStats } from "../../bridge/commands";
import { formatTokenCount, shortUsageDate, usagePeriodLabel } from "../agentUsageFormat";
import { relativeTime } from "../relativeTime";
import type { AgentUsageStats as AgentUsageStatsData } from "../types";

const PERIODS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All time" },
] as const;

export function StatsView() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<AgentUsageStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setStats((await AgentUsageStats(days)) as AgentUsageStatsData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const chartDays = useMemo(() => {
    const values = stats?.daily ?? [];
    return days === 0 ? values.slice(-28) : values;
  }, [stats, days]);
  const chartMax = Math.max(1, ...chartDays.map((day) => day.totalTokens));
  const totalFiles = stats?.sources.reduce((sum, source) => sum + source.files, 0) ?? 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="app-drag flex items-center gap-4 -mx-3 py-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Stats</h1>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Local token usage across your LPM projects
          </p>
        </div>
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-0.5">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              onClick={() => {
                if (period.days !== days) {
                  setStats(null);
                  setDays(period.days);
                }
              }}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                days === period.days
                  ? "bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {period.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh stats"
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {loading ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-400">
            Could not load agent stats: {error}
          </div>
        )}

        {!error && !stats && loading && (
          <div className="flex h-48 items-center justify-center text-[var(--text-muted)]">
            <LoaderCircle size={18} className="animate-spin" />
          </div>
        )}

        {stats && (
          <div className="space-y-4 pb-2">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Total tokens", value: stats.totals.totalTokens, detail: usagePeriodLabel(days) },
                { label: "Input", value: stats.totals.inputTokens, detail: `${formatTokenCount(stats.totals.cachedInputTokens)} cached` },
                { label: "Output", value: stats.totals.outputTokens, detail: `${formatTokenCount(stats.totals.reasoningTokens)} reasoning` },
                { label: "Agent sessions", value: stats.sessions, detail: `${stats.projects.length} project${stats.projects.length === 1 ? "" : "s"}` },
              ].map((card) => (
                <div key={card.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3.5">
                  <div className="text-xs text-[var(--text-muted)]">{card.label}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
                    {formatTokenCount(card.value)}
                  </div>
                  <div className="mt-1 text-[11px] text-[var(--text-muted)]">{card.detail}</div>
                </div>
              ))}
            </div>

            {stats.totals.totalTokens === 0 ? (
              <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-6 text-center">
                <div className="text-sm font-medium">No local agent usage found</div>
                <p className="mt-1 max-w-md text-xs leading-5 text-[var(--text-muted)]">
                  LPM reads token metadata from Claude Code and Codex session histories. Usage appears here after an agent runs inside a configured local project.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)] gap-3">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <div className="flex items-center justify-between">
                      <h2 className="text-sm font-medium">Token activity</h2>
                      <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#D97757]" />Claude Code</span>
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#10A37F]" />Codex</span>
                      </div>
                    </div>
                    <div className="mt-5 flex h-32 items-end gap-1.5 border-b border-[var(--border)] px-1">
                      {chartDays.map((day) => {
                        const height = Math.max(3, (day.totalTokens / chartMax) * 100);
                        const claudeShare = day.totalTokens === 0 ? 0 : (day.claudeTokens / day.totalTokens) * 100;
                        return (
                          <div
                            key={day.date}
                            title={`${shortUsageDate(day.date)} · ${formatTokenCount(day.totalTokens)} tokens`}
                            className="group flex min-w-0 flex-1 flex-col justify-end"
                            style={{ height: `${height}%` }}
                          >
                            <div className="flex min-h-[3px] w-full flex-1 flex-col overflow-hidden rounded-t-sm opacity-80 transition-opacity group-hover:opacity-100">
                              <div className="bg-[#D97757]" style={{ height: `${claudeShare}%` }} />
                              <div className="min-h-0 flex-1 bg-[#10A37F]" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex justify-between text-[10px] text-[var(--text-muted)]">
                      <span>{chartDays[0] ? shortUsageDate(chartDays[0].date) : ""}</span>
                      <span>{chartDays.at(-1) ? shortUsageDate(chartDays.at(-1)!.date) : ""}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                    <h2 className="text-sm font-medium">Agents</h2>
                    <div className="mt-3 space-y-4">
                      {stats.providers.map((provider) => {
                        const share = stats.totals.totalTokens === 0 ? 0 : (provider.tokens.totalTokens / stats.totals.totalTokens) * 100;
                        const color = provider.key === "claude" ? "#D97757" : "#10A37F";
                        return (
                          <div key={provider.key}>
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="flex items-center gap-2 font-medium"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{provider.label}</span>
                              <span className="tabular-nums">{formatTokenCount(provider.tokens.totalTokens)}</span>
                            </div>
                            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-active)]">
                              <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                            </div>
                            <div className="mt-1.5 text-[10px] text-[var(--text-muted)]">
                              {provider.sessions} session{provider.sessions === 1 ? "" : "s"} · {Math.round(share)}%
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                      <h2 className="text-sm font-medium">Projects</h2>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {stats.projects.slice(0, 10).map((project) => (
                        <div key={project.key} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                          <span className="min-w-0 flex-1 truncate font-medium">{project.label}</span>
                          <span className="text-[var(--text-muted)]">{project.sessions} session{project.sessions === 1 ? "" : "s"}</span>
                          <span className="w-16 text-right font-medium tabular-nums">{formatTokenCount(project.tokens.totalTokens)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                    <div className="border-b border-[var(--border)] px-4 py-3">
                      <h2 className="text-sm font-medium">Recent sessions</h2>
                    </div>
                    <div className="divide-y divide-[var(--border)]">
                      {stats.recentSessions.slice(0, 10).map((session, index) => (
                        <div key={`${session.provider}-${session.project}-${session.lastAt}-${index}`} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: session.provider === "claude" ? "#D97757" : "#10A37F" }} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{session.project}</div>
                            <div className="mt-0.5 truncate text-[10px] text-[var(--text-muted)]">{session.model}</div>
                          </div>
                          <span className="text-[10px] text-[var(--text-muted)]">{relativeTime(Math.floor(session.lastAt / 1000))}</span>
                          <span className="w-16 text-right font-medium tabular-nums">{formatTokenCount(session.tokens.totalTokens)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-between px-1 text-[10px] text-[var(--text-muted)]">
              <span>Usage metadata stays on this Mac. Prompts and responses are not included.</span>
              <span>{totalFiles.toLocaleString()} local history files scanned · SSH projects excluded</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
