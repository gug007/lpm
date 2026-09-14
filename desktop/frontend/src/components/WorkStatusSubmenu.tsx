import type { CustomWorkStatus, WorkStatus } from "../types";
import {
  sameWorkStatus,
  workStatusChoiceKey,
  workStatusEmoji,
  workStatusLabel,
  workStatusMenu,
  type WorkStatusChoice,
} from "../workStatus";
import { PlusIcon, SmileIcon } from "./icons";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import { SortableItem, SortableList } from "./ui/SortableList";
import { WorkStatusEmoji } from "./WorkStatusEmoji";
import { WorkStatusMenuRow } from "./WorkStatusMenuRow";

interface WorkStatusSubmenuProps {
  current?: WorkStatus;
  custom: CustomWorkStatus[];
  order?: string[];
  // `null` clears.
  onPick: (choice: WorkStatusChoice | null) => void;
  onAdd: () => void;
  onEdit: (entry: CustomWorkStatus) => void;
  onRemove: (entry: CustomWorkStatus) => void;
  onReorder: (order: string[]) => void;
  onClose: () => void;
}

/** "Status ▸" every status in the order the user keeps them — drag a row to
 *  change it, hover one of yours to edit or remove it — then a way to add
 *  more and Clear once something is set. */
export function WorkStatusSubmenu({
  current,
  custom,
  order,
  onPick,
  onAdd,
  onEdit,
  onRemove,
  onReorder,
  onClose,
}: WorkStatusSubmenuProps) {
  const then = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const currentEmoji = current ? workStatusEmoji(current) : "";
  const menu = workStatusMenu(custom, order);
  const own = new Map(custom.map((s) => [s.label, s]));
  return (
    <ContextMenuSubmenu
      label="Status"
      icon={currentEmoji ? <WorkStatusEmoji emoji={currentEmoji} /> : <SmileIcon />}
    >
      <SortableList ids={menu.map(workStatusChoiceKey)} onReorder={onReorder}>
        {menu.map((choice) => {
          const key = workStatusChoiceKey(choice);
          const entry = choice.input.state === "custom" ? own.get(choice.label) : undefined;
          return (
            <SortableItem key={key} id={key}>
              <WorkStatusMenuRow
                label={choice.label}
                emoji={choice.emoji}
                current={sameWorkStatus(current, choice.input)}
                asks={choice.asksNote}
                onPick={then(() => onPick(choice))}
                actions={
                  entry && {
                    onEdit: then(() => onEdit(entry)),
                    onRemove: then(() => onRemove(entry)),
                  }
                }
              />
            </SortableItem>
          );
        })}
      </SortableList>
      <ContextMenuSeparator />
      <ContextMenuItem label="Add status…" icon={<PlusIcon />} onClick={then(onAdd)} />
      {current && (
        <ContextMenuItem
          label={`Clear ${workStatusLabel(current)}`}
          icon={<span className="block w-3.5" />}
          destructive
          onClick={then(() => onPick(null))}
        />
      )}
    </ContextMenuSubmenu>
  );
}
