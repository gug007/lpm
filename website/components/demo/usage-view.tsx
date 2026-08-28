"use client";

import { Zap } from "lucide-react";
import {
  TOKENS_TODAY,
  USAGE_PROVIDERS,
  usageBarColor,
  usagePaceColor,
  usagePaceLabel,
  type UsageProviderData,
  type UsageSidebarSettings,
  type UsageToolKey,
  type UsageWindowChoice,
  type UsageWindowData,
} from "./usage-data";
import { SegmentedControl, Switch, type SegmentedOption } from "./ui-kit";
import { FOCUS_RING } from "./ui";

const WINDOWS: readonly SegmentedOption<UsageWindowChoice>[] = [
  { value: "fiveHour", label: "5-hour" },
  { value: "weekly", label: "Weekly" },
  { value: "higher", label: "Higher" },
];

type UsageViewProps = {
  settings: UsageSidebarSettings;
  onSettingsChange: (settings: UsageSidebarSettings) => void;
};

export function UsageView({ settings, onSettingsChange }: UsageViewProps) {
  const toggleTool = (tool: UsageToolKey) => {
    const next = settings.tools.includes(tool)
      ? settings.tools.filter((key) => key !== tool)
      : (["claude", "codex"] as UsageToolKey[]).filter(
          (key) => key === tool || settings.tools.includes(key),
        );
    onSettingsChange({ ...settings, tools: next });
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[#1a1a1a]">
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3 sm:px-4">
        <span className="text-[#919191]">
          <Zap className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <div className="text-base font-semibold leading-tight text-[#e5e5e5]">Usage</div>
          <div className="text-[11px] text-[#919191]">
            Live plan usage for your AI coding tools
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-[#2e2e2e] px-3 py-3 sm:px-4">
        <div className="grid gap-3 lg:grid-cols-2">
          {USAGE_PROVIDERS.map((provider) => (
            <ProviderCard key={provider.key} provider={provider} />
          ))}
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-[#2e2e2e] bg-[#242424]">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[#e5e5e5]">Show usage in the sidebar</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">
                A compact meter above the sidebar footer — {TOKENS_TODAY} spent today.
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onChange={(enabled) => onSettingsChange({ ...settings, enabled })}
              aria-label="Show usage in the sidebar"
            />
          </div>

          <OptionRow
            title="What to show"
            desc="Hide a tool you don't care about tracking."
            disabled={!settings.enabled}
          >
            <div className="flex gap-1.5">
              {USAGE_PROVIDERS.map((provider) => {
                const on = settings.tools.includes(provider.key);
                return (
                  <button
                    key={provider.key}
                    type="button"
                    role="switch"
                    aria-checked={on}
                    onClick={() => toggleTool(provider.key)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors ${FOCUS_RING} ${
                      on
                        ? "border-[#60a5fa] bg-[#60a5fa]/10 text-[#e5e5e5]"
                        : "border-[#2e2e2e] text-[#919191] hover:bg-[#2a2a2a]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: provider.color, opacity: on ? 1 : 0.5 }}
                    />
                    {provider.label}
                  </button>
                );
              })}
            </div>
          </OptionRow>

          <OptionRow
            title="Which window"
            desc="Each line shows a single number; pick which one it is."
            disabled={!settings.enabled}
          >
            <SegmentedControl
              ariaLabel="Which usage window the sidebar shows"
              value={settings.window}
              options={WINDOWS}
              onChange={(window) => onSettingsChange({ ...settings, window })}
            />
          </OptionRow>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-[#919191]">
          lpm reads the limits your agents report locally, so you see what&apos;s left before a
          window runs out mid-task.
        </p>
      </div>
    </div>
  );
}

function ProviderCard({ provider }: { provider: UsageProviderData }) {
  return (
    <section className="rounded-xl border border-[#2e2e2e] bg-[#242424] p-4">
      <header className="flex items-center gap-2 border-b border-[#2e2e2e] pb-3">
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: provider.color }}
        />
        <span className="shrink-0 text-sm font-medium text-[#e5e5e5]">{provider.label}</span>
        {provider.account && (
          <span className="min-w-0 truncate text-[11px] text-[#919191]">{provider.account}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <span className="rounded border border-[#2e2e2e] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[#b3b3b3]">
            {provider.plan}
          </span>
          <span className="text-[11px] tabular-nums text-[#919191]">{provider.updated}</span>
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-3.5">
        <Meter label="5-hour" win={provider.fiveHour} />
        <Meter label="Weekly" win={provider.weekly} />
      </div>

      <div className="mt-3.5 border-t border-[#2e2e2e] pt-3 text-[11px] tabular-nums text-[#919191]">
        {provider.tokensToday} spent today · {provider.sessions} sessions
      </div>
    </section>
  );
}

function Meter({ label, win }: { label: string; win: UsageWindowData }) {
  const pace = usagePaceLabel(win);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.13em] text-[#919191]">
        {label}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="text-2xl font-semibold leading-none tabular-nums tracking-tight text-[#e5e5e5]">
          {Math.round(win.usedPercent)}
        </span>
        <span className="text-[12px] leading-none text-[#919191]">%</span>
        {pace && <span className={`text-[11px] leading-none ${usagePaceColor(pace)}`}>{pace}</span>}
      </div>
      <div
        role="meter"
        aria-label={`${label} window usage`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(win.usedPercent)}
        title={`${Math.round(win.elapsedPercent)}% of the window has elapsed`}
        className="relative h-1.5 w-full overflow-hidden rounded-full bg-[#333333]"
      >
        <div
          className="h-full rounded-full transition-[width] duration-700"
          style={{
            width: `${Math.max(1, Math.min(100, win.usedPercent))}%`,
            backgroundColor: usageBarColor(win.usedPercent),
          }}
        />
        {win.elapsedPercent >= 5 && (
          <div
            aria-hidden="true"
            className="absolute inset-y-0 w-px -translate-x-1/2 bg-[#b3b3b3] opacity-70"
            style={{ left: `${win.elapsedPercent}%` }}
          />
        )}
      </div>
      <span className="truncate text-[11px] tabular-nums text-[#919191]">
        resets in {win.resetIn} · {win.resetAt}
      </span>
    </div>
  );
}

function OptionRow({
  title,
  desc,
  disabled,
  children,
}: {
  title: string;
  desc: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-disabled={disabled}
      className={`flex items-center gap-4 border-t border-[#2e2e2e] px-4 py-3 transition-opacity ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[#e5e5e5]">{title}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">{desc}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
