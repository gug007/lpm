import { useMemo, useRef, useState } from "react";
import { formatTokenCount } from "../agentUsageFormat";
import { usageRows, type UsageRow } from "../sidebarUsage";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { useProjectClaudeAccounts } from "../hooks/useProjectClaudeAccounts";
import { useTokensToday } from "../hooks/useTokensToday";
import { useAccountsStore } from "../store/accounts";
import { useAppStore } from "../store/app";
import { useSettingsStore } from "../store/settings";
import { usageSidebarTools, usageSidebarWindow } from "./usageSidebarSettings";
import { displayNameForProjectName } from "./ProjectNameDisplay";
import { PaceTick } from "./PaceTick";
import { SidebarUsagePopover } from "./SidebarUsagePopover";
import { UsageProviderCard } from "./UsageProviderCard";
import { Tooltip } from "./ui/Tooltip";

const HOVER_DELAY_MS = 250;
const CLAUDE_ACCOUNT_ROW = "claude:";

function spentLine(row: UsageRow): string {
  if (row.tokens <= 0) return "";
  const sessions = row.sessions === 1 ? "1 session" : `${row.sessions} sessions`;
  return `${formatTokenCount(row.tokens)} spent today · ${sessions}`;
}

type AccountMark = "current" | "standby";

const TAG: Record<AccountMark, { text: string; className: string }> = {
  current: {
    text: "in use",
    className:
      "font-medium bg-[color-mix(in_srgb,var(--accent-claude)_16%,transparent)] text-[var(--accent-claude-text)]",
  },
  standby: {
    text: "pool",
    className:
      "text-[var(--text-muted)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--text-primary)_20%,transparent)]",
  },
};

interface AccountNote {
  mark: AccountMark;
  text: string;
}

function RowBody({ row, note }: { row: UsageRow; note?: AccountNote }) {
  const width = row.fraction > 0 ? Math.max(2, Math.round(row.fraction * 100)) : 0;
  return (
    <>
      <span className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: row.color, opacity: row.stale ? 0.5 : 1 }}
        />
        <span className="min-w-[42px] max-w-[96px] shrink-0 truncate text-[11px] text-[var(--text-secondary)]">
          {row.label}
        </span>
        {note && (
          <>
            <span
              aria-hidden="true"
              className={`shrink-0 rounded px-1 text-[10px] leading-4 ${TAG[note.mark].className}`}
            >
              {TAG[note.mark].text}
            </span>
            <span className="sr-only">{note.text}</span>
          </>
        )}
        <span className="ml-auto min-w-0 truncate text-[10px] tabular-nums text-[var(--text-muted)]">
          {row.detail}
        </span>
        {row.percentText && (
          <span
            className={`w-8 shrink-0 text-right text-[11px] tabular-nums ${
              row.stale ? "text-[var(--text-muted)]" : "text-[var(--text-secondary)]"
            }`}
          >
            {row.percentText}
          </span>
        )}
      </span>
      <span className="relative block">
        <span className="block h-[3px] w-full overflow-hidden rounded-full bg-[var(--bg-active)]">
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${width}%`,
              backgroundColor: row.fill,
              opacity: row.stale ? 0.4 : 1,
            }}
          />
        </span>
        {row.pace !== null && <PaceTick at={row.pace} dim={row.stale} />}
      </span>
    </>
  );
}

// Live plan usage in the sidebar footer: one line per agent CLI — or per Claude
// account, since each carries its own plan — with when its window comes back,
// over a bar of how much of it is gone. A tool that has no window yet falls back
// to what it spent today, so a row never goes blank. Hovering a row opens the
// same card the Usage window shows. With more than one Claude account listed,
// the selected project's account carries an "in use" tag and the rest of its
// pool a "pool" tag.
export function SidebarUsage({ onOpen }: { onOpen: () => void }) {
  const enabled = useSettingsStore((s) => s.usageInSidebar ?? true);
  const tools = useSettingsStore(usageSidebarTools);
  const choice = useSettingsStore(usageSidebarWindow);
  const { limits } = useAgentLimits();
  const { stats } = useTokensToday(enabled);
  const now = useNow(enabled, 30_000);
  const claudeAccounts = useAccountsStore((s) => s.accounts);
  const accountStatuses = useAccountsStore((s) => s.statuses);
  const selected = useAppStore((s) => s.selected);
  const projects = useAppStore((s) => s.projects);
  const inUse = useProjectClaudeAccounts(enabled ? selected : null);
  const [hovered, setHovered] = useState<{ id: string; anchor: DOMRect } | null>(null);
  const timer = useRef<number | null>(null);

  const accounts = useMemo(
    () =>
      claudeAccounts.map((a) => ({
        id: a.id,
        label: a.label,
        email: accountStatuses[a.id]?.email,
      })),
    [claudeAccounts, accountStatuses],
  );

  const rows = useMemo(
    () => (enabled ? usageRows(limits, stats, now, { tools, window: choice, accounts }) : []),
    [enabled, limits, stats, now, tools, choice, accounts],
  );

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const open = (id: string, target: HTMLElement) => {
    clearTimer();
    const anchor = target.getBoundingClientRect();
    timer.current = window.setTimeout(() => setHovered({ id, anchor }), HOVER_DELAY_MS);
  };

  const close = () => {
    clearTimer();
    setHovered(null);
  };

  if (rows.length === 0) return null;

  const accountRows = rows.filter((row) => row.id.startsWith(CLAUDE_ACCOUNT_ROW)).length;
  const noteFor = (row: UsageRow): AccountNote | undefined => {
    if (!inUse || !selected || accountRows < 2 || !row.id.startsWith(CLAUDE_ACCOUNT_ROW)) return undefined;
    const id = row.id.slice(CLAUDE_ACCOUNT_ROW.length);
    const project = displayNameForProjectName(selected, projects);
    if (id === inUse.current) return { mark: "current", text: `New Claude sessions in ${project} use this account` };
    if (inUse.standby.includes(id)) return { mark: "standby", text: `${project} can switch to this account` };
    return undefined;
  };

  return (
    <div className="flex flex-col gap-0.5 px-2 pb-0.5 pt-1">
      {rows.map((row) => {
        const note = noteFor(row);
        const button = (
          <button
            type="button"
            onClick={onOpen}
            onMouseEnter={(e) => row.data && open(row.id, e.currentTarget)}
            onMouseLeave={close}
            className="flex w-full flex-col gap-1 rounded-md px-3 py-1 text-left hover:bg-[var(--bg-hover)]"
          >
            <RowBody row={row} note={note} />
          </button>
        );
        const spent = spentLine(row);

        // Only a row backed by a usage snapshot has a card to show; one that
        // knows nothing but the day's spend keeps the plain tooltip.
        if (!row.data) {
          return (
            <Tooltip
              key={row.id}
              side="right"
              delay={HOVER_DELAY_MS}
              wide
              triggerClassName="flex w-full"
              content={
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{row.label}</span>
                  {row.subtitle && <span className="opacity-70">{row.subtitle}</span>}
                  {note && <span>{note.text}</span>}
                  {spent && <span className="tabular-nums">{spent}</span>}
                  <span className="opacity-70">No usage window reported yet.</span>
                </span>
              }
            >
              {button}
            </Tooltip>
          );
        }

        return (
          <div key={row.id} className="contents">
            {button}
            {hovered?.id === row.id && (
              <SidebarUsagePopover anchor={hovered.anchor}>
                <UsageProviderCard
                  data={row.data}
                  now={now}
                  title={row.label}
                  subtitle={row.subtitle}
                  footer={
                    note || spent ? (
                      <span className="flex flex-col gap-1">
                        {note && <span>{note.text}</span>}
                        {spent && <span>{spent}</span>}
                      </span>
                    ) : undefined
                  }
                />
              </SidebarUsagePopover>
            )}
          </div>
        );
      })}
    </div>
  );
}
