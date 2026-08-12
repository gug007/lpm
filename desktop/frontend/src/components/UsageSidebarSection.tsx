import { providerMeta } from "../agentStatus";
import { formatTokenCount } from "../agentUsageFormat";
import { USAGE_TOOLS, type UsageWindowChoice } from "../sidebarUsage";
import { useSettingsStore } from "../store/settings";
import { usageSidebarTools, usageSidebarWindow } from "./usageSidebarSettings";
import { SwitchRow } from "./SwitchRow";
import { SidebarIcon } from "./icons";
import { SegmentedControl } from "./ui/SegmentedControl";

const WINDOWS: readonly { value: UsageWindowChoice; label: string }[] = [
  { value: "fiveHour", label: "5-hour" },
  { value: "weekly", label: "Weekly" },
  { value: "higher", label: "Whichever is higher" },
];

function ToolChip({
  provider,
  on,
  onToggle,
}: {
  provider: string;
  on: boolean;
  onToggle: () => void;
}) {
  const meta = providerMeta(provider);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
        on
          ? "border-[var(--accent-blue)] bg-[var(--accent-blue)]/10 text-[var(--text-primary)]"
          : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
      }`}
    >
      <span
        aria-hidden="true"
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: meta.color, opacity: on ? 1 : 0.5 }}
      />
      {meta.short}
    </button>
  );
}

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

  const toggleTool = (provider: string) => {
    const next = tools.includes(provider)
      ? tools.filter((tool) => tool !== provider)
      : USAGE_TOOLS.filter((tool) => tool === provider || tools.includes(tool));
    void update({ usageSidebarTools: next });
  };

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
            <ToolChip
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
        description="Each line shows a single number; pick which one it is."
        disabled={!enabled}
      >
        <SegmentedControl
          value={choice}
          options={WINDOWS}
          ariaLabel="Sidebar usage window"
          onChange={(value) => void update({ usageSidebarWindow: value })}
        />
      </OptionRow>
    </div>
  );
}
