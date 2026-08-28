"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { FOCUS_RING } from "./ui";
import {
  RECENT_SESSIONS,
  agoLabel,
  formatTokens,
  formatUsd,
  statsForPeriod,
  type StatsPeriod,
  type StatsSlice,
} from "./stats-data";

const PERIODS: { days: StatsPeriod; label: string }[] = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 0, label: "All time" },
];

const CLAUDE_COLOR = "#D97757";
const CODEX_COLOR = "#10A37F";

export function StatsView() {
  const [days, setDays] = useState<StatsPeriod>(30);
  const stats = statsForPeriod(days);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <BarChart3 className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Stats</div>
          <div className="text-[11px] text-[#919191]">
            Local token usage across your lpm projects
          </div>
        </div>
        <div className="ml-auto flex shrink-0 rounded-lg border border-[#2e2e2e] bg-[#242424] p-0.5">
          {PERIODS.map((period) => (
            <button
              key={period.days}
              type="button"
              onClick={() => setDays(period.days)}
              className={`rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                days === period.days
                  ? "bg-[#333333] text-[#e5e5e5]"
                  : "text-[#919191] hover:bg-[#2a2a2a] hover:text-[#b3b3b3]"
              } ${FOCUS_RING}`}
            >
              {period.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#2e2e2e] px-3 py-3 sm:px-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Tile
            label="Total tokens"
            value={formatTokens(stats.total)}
            aside={
              <span className="text-sm font-medium tabular-nums text-[#b3b3b3]">
                <span className="text-[#919191]">≈</span> {formatUsd(stats.cost)}
              </span>
            }
            caption={
              days === 1
                ? "so far today"
                : stats.peak
                  ? `peak ${formatTokens(stats.peak.tokens)} · ${agoLabel(stats.peak.ago)}`
                  : undefined
            }
          />
          <Tile
            label="Input"
            value={formatTokens(stats.input)}
            caption={`${Math.round(stats.cacheShare * 100)}% from cache`}
          />
          <Tile
            label="Output"
            value={formatTokens(stats.output)}
            caption={`${Math.round(stats.reasoningShare * 100)}% reasoning`}
          />
          <Tile
            label="Sessions"
            value={stats.sessions.toLocaleString()}
            caption={`${stats.projects.length} projects · ${stats.models.length} models`}
          />
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {days === 1 ? <TodayPanel stats={stats} /> : <ActivityChart stats={stats} />}
          <Panel title="By tool">
            <div className="mb-3 flex h-2.5 overflow-hidden rounded-full bg-[#333333]">
              <span
                style={{
                  width: `${(stats.claude / stats.total) * 100}%`,
                  backgroundColor: CLAUDE_COLOR,
                }}
              />
              <span
                style={{
                  width: `${(stats.codex / stats.total) * 100}%`,
                  backgroundColor: CODEX_COLOR,
                }}
              />
            </div>
            <ShareRow
              color={CLAUDE_COLOR}
              label="Claude Code"
              tokens={stats.claude}
              total={stats.total}
            />
            <ShareRow
              color={CODEX_COLOR}
              label="Codex"
              tokens={stats.codex}
              total={stats.total}
            />
          </Panel>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Panel title="Top projects">
            {stats.projects.map((project) => (
              <div key={project.name} className="mb-2.5 last:mb-0">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-[#e5e5e5]">{project.name}</span>
                  <span className="shrink-0 tabular-nums text-[#919191]">
                    {formatTokens(project.tokens)}
                  </span>
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#333333]">
                  <div
                    className="h-full rounded-full bg-[#60a5fa]/[0.32]"
                    style={{ width: `${(project.tokens / stats.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </Panel>
          <Panel title="Recent sessions">
            {RECENT_SESSIONS.map((session, index) => (
              <div
                key={index}
                className="flex items-baseline gap-2 border-b border-[#2e2e2e] py-2 text-xs last:border-b-0"
              >
                <span className="min-w-0 flex-1 truncate text-[#e5e5e5]">{session.project}</span>
                <span className="hidden max-w-[84px] shrink-0 truncate rounded bg-[#333333] px-1.5 py-0.5 font-mono text-[10px] text-[#b3b3b3] sm:inline-block">
                  {session.model}
                </span>
                <span className="w-14 shrink-0 text-right font-medium tabular-nums text-[#e5e5e5]">
                  {formatTokens(session.tokens)}
                </span>
                <span className="w-16 shrink-0 text-right tabular-nums text-[#919191]">
                  {session.when}
                </span>
              </div>
            ))}
          </Panel>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-[#919191]">
          Usage metadata stays on your Mac — lpm reads token counts from local session histories.
          Prompts and responses are never included.
        </p>
      </div>
    </div>
  );
}

function ActivityChart({ stats }: { stats: StatsSlice }) {
  const peak = Math.max(...stats.daily.map((day) => day.claude + day.codex), 1);
  return (
    <Panel title="Token activity">
      <div className="flex h-24 items-end gap-[3px]">
        {stats.daily.map((day) => {
          const total = day.claude + day.codex;
          return (
            <div
              key={day.ago}
              title={`${agoLabel(day.ago)} — ${formatTokens(total)}`}
              className="flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <div
                className="w-full rounded-t-[2px]"
                style={{
                  height: `${(day.codex / peak) * 100}%`,
                  backgroundColor: CODEX_COLOR,
                }}
              />
              <div
                className="w-full"
                style={{
                  height: `${(day.claude / peak) * 100}%`,
                  backgroundColor: CLAUDE_COLOR,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[11px] tabular-nums text-[#919191]">
        <span>{agoLabel(stats.daily[0]?.ago ?? 0)}</span>
        <span>today</span>
      </div>
    </Panel>
  );
}

function TodayPanel({ stats }: { stats: StatsSlice }) {
  const rows = [
    { label: "Claude Code", tokens: stats.claude, color: CLAUDE_COLOR },
    { label: "Codex", tokens: stats.codex, color: CODEX_COLOR },
  ];
  return (
    <Panel title="Today by tool">
      {rows.map((row) => (
        <div key={row.label} className="mb-3 last:mb-0">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-[#e5e5e5]">{row.label}</span>
            <span className="tabular-nums text-[#919191]">{formatTokens(row.tokens)}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#333333]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(row.tokens / stats.total) * 100}%`,
                backgroundColor: row.color,
              }}
            />
          </div>
        </div>
      ))}
      <p className="mt-3 text-[11px] text-[#919191]">
        Counts update as your agents run — no account linking, no upload.
      </p>
    </Panel>
  );
}

function Tile({
  label,
  value,
  aside,
  caption,
}: {
  label: string;
  value: string;
  aside?: React.ReactNode;
  caption?: string;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-[#2e2e2e] bg-[#242424] px-4 py-3.5">
      <div className="text-xs text-[#919191]">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums tracking-tight text-[#e5e5e5]">
          {value}
        </div>
        {aside}
      </div>
      {caption && (
        <div className="mt-auto pt-2 text-[11px] tabular-nums text-[#919191]">{caption}</div>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#242424]">
      <div className="border-b border-[#2e2e2e] px-4 py-3 text-sm font-medium text-[#e5e5e5]">
        {title}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function ShareRow({
  color,
  label,
  tokens,
  total,
}: {
  color: string;
  label: string;
  tokens: number;
  total: number;
}) {
  return (
    <div className="flex items-baseline gap-2 py-1.5 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="min-w-0 flex-1 truncate text-[#e5e5e5]">{label}</span>
      <span className="shrink-0 tabular-nums text-[#919191]">{formatTokens(tokens)}</span>
      <span className="w-8 shrink-0 text-right tabular-nums text-[#919191]">
        {Math.round((tokens / total) * 100)}%
      </span>
    </div>
  );
}
