import { accountLabel } from "../claudePoolText";
import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { accountMeters } from "../sidebarUsage";
import { useAccountsStore } from "../store/accounts";
import { MAIN_POOL, poolForProjectKey, useClaudePoolStore } from "../store/claudePool";
import type { ClaudeAccountChoice, ProjectInfo } from "../types";
import { ClaudeAccountMenuRow } from "./ClaudeAccountMenuRow";
import { CheckIcon, CornerUpLeftIcon, RefreshIcon, SettingsIcon, UserIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";

const MAIN_LOGIN = "default";

export type ClaudeOwnChoice = Pick<ProjectInfo, "claudeAccount" | "claudeAccounts">;

function usesMainAccounts(own: ClaudeOwnChoice | undefined, isCopy: boolean): boolean {
  if (own?.claudeAccount !== undefined) return false;
  if (own?.claudeAccounts === undefined) return !isCopy;
  return own.claudeAccounts.length === 0;
}

function followsParent(own: ClaudeOwnChoice | undefined): boolean {
  return own?.claudeAccount === undefined && own?.claudeAccounts === undefined;
}

interface ClaudeAccountSubmenuProps {
  // The project's own keys; both undefined when it sets neither.
  own?: ClaudeOwnChoice;
  // A copy can follow its parent's choice instead of holding one of its own.
  isCopy: boolean;
  // The parent's own keys, named on the "Same as parent" row.
  parent?: ClaudeOwnChoice;
  onPick: (choice: ClaudeAccountChoice) => void;
  // Opens the dialog for an ordered list of accounts.
  onChooseList: () => void;
  onManage: () => void;
  onClose: () => void;
}

/** "Claude account ▸": which login new Claude sessions in this project use —
 *  the main accounts from Settings, one account always, or its own list —
 *  with each account's 5-hour and weekly usage beside it. */
export function ClaudeAccountSubmenu({
  own,
  isCopy,
  parent,
  onPick,
  onChooseList,
  onManage,
  onClose,
}: ClaudeAccountSubmenuProps) {
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const pool = useClaudePoolStore((s) => s.pool);
  const { limits } = useAgentLimits();
  const now = useNow(true, 60000);
  if (accounts.length === 0) return null;

  const then = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const label = (id: string) => accountLabel(id, pool);
  const choiceText = (c: ClaudeOwnChoice | undefined): string => {
    if (c?.claudeAccount !== undefined) return c.claudeAccount === "" ? "Main login" : label(c.claudeAccount);
    if (c?.claudeAccounts?.length) return c.claudeAccounts.map(label).join(", ");
    return "Main accounts";
  };
  const mainNow = (() => {
    if (!pool?.active) return "Main login";
    const current = poolForProjectKey(pool, MAIN_POOL)?.current;
    const name = current ? label(current) : "Main login";
    return pool.paused ? `Paused · ${name}` : name;
  })();
  const list = own?.claudeAccount === undefined ? own?.claudeAccounts ?? [] : [];
  const check = (on: boolean) => <span className="flex w-3 justify-end">{on && <CheckIcon />}</span>;

  return (
    <ContextMenuSubmenu label="Claude account" icon={<UserIcon />}>
      <div className="w-64">
        {isCopy && (
          <>
            <ContextMenuItem
              label="Same as parent"
              icon={<CornerUpLeftIcon />}
              trailing={
                <span className="flex items-center gap-2">
                  <span className="text-[10px]">{choiceText(parent)}</span>
                  {check(followsParent(own))}
                </span>
              }
              onClick={then(() => onPick({ kind: "parent" }))}
            />
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem
          label="Main accounts"
          icon={<RefreshIcon />}
          trailing={
            <span className="flex items-center gap-2">
              <span className="text-[10px]">{mainNow}</span>
              {check(usesMainAccounts(own, isCopy))}
            </span>
          }
          onClick={then(() => onPick({ kind: "main" }))}
        />
        <ContextMenuSeparator />
        <div className="px-3 pb-0.5 pt-1 text-[10px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          Always use one account
        </div>
        <ClaudeAccountMenuRow
          label="Main login only"
          signedIn={statuses[MAIN_LOGIN]?.signedIn !== false}
          meters={accountMeters(limits, MAIN_LOGIN, now)}
          current={own?.claudeAccount === ""}
          onClick={then(() => onPick({ kind: "pin", id: "" }))}
        />
        {accounts.map((a) => (
          <ClaudeAccountMenuRow
            key={a.id}
            label={a.label}
            signedIn={statuses[a.id]?.signedIn !== false}
            meters={accountMeters(limits, a.id, now)}
            current={own?.claudeAccount === a.id}
            onClick={then(() => onPick({ kind: "pin", id: a.id }))}
          />
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem
          label="Choose accounts…"
          icon={<UserIcon />}
          trailing={
            <span className="flex items-center gap-2">
              {list.length > 0 && <span className="max-w-24 truncate text-[10px]">{list.map(label).join(", ")}</span>}
              {check(list.length > 0)}
            </span>
          }
          onClick={then(onChooseList)}
        />
        <ContextMenuSeparator />
        <ContextMenuItem label="Manage accounts…" icon={<SettingsIcon />} onClick={then(onManage)} />
      </div>
    </ContextMenuSubmenu>
  );
}
