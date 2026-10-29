import { formatTokenCount } from "../agentUsageFormat";
import { USAGE_TOOLS } from "../sidebarUsage";
import { useSettingsStore } from "../store/settings";
import {
  toggledUsageTool,
  USAGE_WINDOW_OPTIONS,
  usageSidebarTools,
  usageSidebarWindow,
} from "./usageSidebarSettings";
import { SwitchRow } from "./SwitchRow";
import { SidebarIcon } from "./icons";
import { SegmentedControl } from "./ui/SegmentedControl";
import { UsageToolChip } from "./UsageToolChip";

function OptionRow({
  title,
  description,
  disabled,
  children,
}: {
  title: string;
  description: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      aria-disabled={disabled}
      className={`flex items-center gap-4 border-t border-[var(--border)] px-4 py-3 transition-opacity ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-[var(--text-primary)]">{title}</span>
        <span className="block text-[12px] leading-snug text-[var(--text-muted)]">
          {description}
        </span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** How the sidebar carries usage: whether it is there at all, which tools it
 *  tracks, and which window its single number comes from. */
export function UsageSidebarSection({ tokensToday }: { tokensToday: number }) {
  const enabled = useSettingsStore((s) => s.usageInSidebar ?? true);
  const tools = useSettingsStore(usageSidebarTools);
  const choice = useSettingsStore(usageSidebarWindow);
  const update = useSettingsStore((s) => s.update);

  const toggleTool = (provider: string) => void update({ usageSidebarTools: toggledUsageTool(tools, provider) });

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
      <SwitchRow
        checked={enabled}
        onChange={(next) => void update({ usageInSidebar: next })}
        icon={<SidebarIcon />}
        title="Show usage in the sidebar"
        description={
          tokensToday > 0
            ? `A compact meter above the sidebar footer — ${formatTokenCount(tokensToday)} spent today.`
            : "A compact meter above the sidebar footer, so you can see what is left without opening this window."
        }
      />
      <OptionRow
        title="What to show"
        description="Hide a tool you do not care about tracking."
        disabled={!enabled}
      >
        <div className="flex gap-2">
          {USAGE_TOOLS.map((provider) => (
            <UsageToolChip
              key={provider}
              provider={provider}
              on={tools.includes(provider)}
              onToggle={() => toggleTool(provider)}
            />
          ))}
        </div>
      </OptionRow>
      <OptionRow
        title="Which window"
        description="Each line's numbers and its upper bar follow this window; the other one is the thin bar under it."
        disabled={!enabled}
      >
        <SegmentedControl
          value={choice}
          options={USAGE_WINDOW_OPTIONS}
          ariaLabel="Sidebar usage window"
          onChange={(value) => void update({ usageSidebarWindow: value })}
        />
      </OptionRow>
    </div>
  );
}
