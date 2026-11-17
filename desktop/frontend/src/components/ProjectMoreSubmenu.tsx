import { Columns2, FolderSync } from "lucide-react";
import {
  BrainIcon,
  CheckSquareIcon,
  DetachIcon,
  FileIcon,
  HardDriveIcon,
  MessageIcon,
  MoreHorizontalIcon,
  SettingsIcon,
  SparkleIcon,
} from "./icons";
import { ClaudeAccountSubmenu, type ClaudeOwnChoice } from "./ClaudeAccountSubmenu";
import { ContextMenuItem } from "./ui/ContextMenuItem";
import { ContextMenuSeparator } from "./ui/ContextMenuSeparator";
import { ContextMenuSubmenu } from "./ui/ContextMenuSubmenu";
import type { ClaudeAccountChoice } from "../types";
import type { SideBySideMenuItem } from "../hooks/useSideBySideMenu";
import { chordLabel } from "../keys";

export interface ProjectMoreSubmenuProps {
  projectName: string;
  // An SSH project (root lives on an SSH host).
  sshRemote: boolean;
  isDuplicate: boolean;
  isDetached: boolean;
  canSelect: boolean;
  removeDisabled: boolean;
  sideBySideItems: SideBySideMenuItem[];
  // The project's own Claude account choice (and its parent's), and the ways
  // to change it.
  claudeChoice?: ClaudeOwnChoice;
  parentClaudeChoice?: ClaudeOwnChoice;
  onPickClaudeAccount: (choice: ClaudeAccountChoice) => void;
  onChooseClaudeAccounts: () => void;
  onManageClaudeAccounts: () => void;
  onEditConfig: () => void;
  onOpenNotes: () => void;
  onOpenAI: () => void;
  onOpenMemory: () => void;
  // Omitted unless another connected computer holds the same project.
  onSyncIgnored?: () => void;
  onDetach: () => void;
  onAttach: () => void;
  onSelect: () => void;
  onRemoveFromDisk?: () => void;
  onClose: () => void;
}

export function ProjectMoreSubmenu({
  projectName,
  sshRemote,
  isDuplicate,
  isDetached,
  canSelect,
  removeDisabled,
  sideBySideItems,
  claudeChoice,
  parentClaudeChoice,
  onPickClaudeAccount,
  onChooseClaudeAccounts,
  onManageClaudeAccounts,
  onEditConfig,
  onOpenNotes,
  onOpenAI,
  onOpenMemory,
  onSyncIgnored,
  onDetach,
  onAttach,
  onSelect,
  onRemoveFromDisk,
  onClose,
}: ProjectMoreSubmenuProps) {
  const close = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return (
    <ContextMenuSubmenu label="More" icon={<MoreHorizontalIcon />}>
      {sideBySideItems.map((item) => (
        <ContextMenuItem
          key={item.label}
          label={item.label}
          icon={<Columns2 size={14} />}
          onClick={close(item.onClick)}
        />
      ))}
      <ContextMenuItem
        label={isDetached ? "Attach to main window" : "Detach to new window"}
        icon={<DetachIcon />}
        onClick={close(isDetached ? onAttach : onDetach)}
      />
      <ContextMenuSeparator />
      {!sshRemote && (
        <ClaudeAccountSubmenu
          projectName={projectName}
          own={claudeChoice}
          isCopy={isDuplicate}
          parent={parentClaudeChoice}
          onPick={onPickClaudeAccount}
          onChooseList={onChooseClaudeAccounts}
          onManage={onManageClaudeAccounts}
          onClose={onClose}
        />
      )}
      <ContextMenuSubmenu label="Project files" icon={<FileIcon size={14} />}>
        <ContextMenuItem label="Edit Config" icon={<SettingsIcon />} shortcut={chordLabel({ key: "e", meta: true })} onClick={close(onEditConfig)} />
        <ContextMenuItem label="Notes" icon={<MessageIcon />} shortcut={chordLabel({ key: "n", meta: true, shift: true })} onClick={close(onOpenNotes)} />
        <ContextMenuItem label="AI Instructions" icon={<SparkleIcon />} onClick={close(onOpenAI)} />
        {!sshRemote && (
          <ContextMenuItem label="Memory" icon={<BrainIcon />} shortcut={chordLabel({ key: "m", meta: true, shift: true })} onClick={close(onOpenMemory)} />
        )}
      </ContextMenuSubmenu>
      {(onSyncIgnored || canSelect) && <ContextMenuSeparator />}
      {onSyncIgnored && (
        <ContextMenuItem label="Sync Ignored Files…" icon={<FolderSync size={14} />} onClick={close(onSyncIgnored)} />
      )}
      {canSelect && <ContextMenuItem label="Select" icon={<CheckSquareIcon />} onClick={close(onSelect)} />}
      {onRemoveFromDisk && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem
            destructive
            label="Remove from disk"
            icon={<HardDriveIcon />}
            onClick={close(onRemoveFromDisk)}
            disabled={removeDisabled}
          />
        </>
      )}
    </ContextMenuSubmenu>
  );
}
