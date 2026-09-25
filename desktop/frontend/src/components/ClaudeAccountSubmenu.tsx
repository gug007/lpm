import { useAgentLimits } from "../hooks/useAgentLimits";
import { useNow } from "../hooks/useNow";
import { accountMeters } from "../sidebarUsage";
import { useAccountsStore } from "../store/accounts";
import { ClaudeAccountMenuRow } from "./ClaudeAccountMenuRow";
import { CheckIcon, CornerUpLeftIcon, SettingsIcon, UserIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";

const MAIN_LOGIN = "default";

interface ClaudeAccountSubmenuProps {
  // The project's own pin: undefined when unset, "" for the main login.
  pinned?: string;
  // A copy can follow its parent's pin instead of holding one of its own.
  isCopy: boolean;
  // The parent's own pin, named on the "Same as parent" row.
  parentPinned?: string;
  // `null` drops the project's own pin; "" is the main login.
  onPick: (account: string | null) => void;
  onManage: () => void;
  onClose: () => void;
}

/** "Claude account ▸" which login new Claude sessions in this project use,
 *  with each account's 5-hour and weekly usage beside it, so the one with room
 *  left is one pick away when another runs out. */
export function ClaudeAccountSubmenu({
  pinned,
  isCopy,
  parentPinned,
  onPick,
  onManage,
  onClose,
}: ClaudeAccountSubmenuProps) {
  const accounts = useAccountsStore((s) => s.accounts);
  const statuses = useAccountsStore((s) => s.statuses);
  const { limits } = useAgentLimits();
  const now = useNow(true, 60000);
  if (accounts.length === 0) return null;

  const then = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const nameOf = (id?: string) =>
    !id ? "Main login" : (accounts.find((a) => a.id === id)?.label ?? "Removed account");

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
                  <span className="text-[10px]">{nameOf(parentPinned)}</span>
                  <span className="flex w-3 justify-end">{pinned === undefined && <CheckIcon />}</span>
                </span>
              }
              onClick={then(() => onPick(null))}
            />
            <ContextMenuSeparator />
          </>
        )}
        <ClaudeAccountMenuRow
          label="Main login"
          signedIn={statuses[MAIN_LOGIN]?.signedIn !== false}
          meters={accountMeters(limits, MAIN_LOGIN, now)}
          current={pinned === "" || (!isCopy && pinned === undefined)}
          onClick={then(() => onPick(""))}
        />
        {accounts.map((a) => (
          <ClaudeAccountMenuRow
            key={a.id}
            label={a.label}
            signedIn={statuses[a.id]?.signedIn !== false}
            meters={accountMeters(limits, a.id, now)}
            current={pinned === a.id}
            onClick={then(() => onPick(a.id))}
          />
        ))}
        <ContextMenuSeparator />
        <ContextMenuItem label="Manage accounts…" icon={<SettingsIcon />} onClick={then(onManage)} />
      </div>
    </ContextMenuSubmenu>
  );
}
