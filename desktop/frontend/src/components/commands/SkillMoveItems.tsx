import { Check, Folder, FolderMinus } from "lucide-react";
import type { LpmCommand, LpmCommandLists } from "../../lpmCommands";
import { ContextMenuItem } from "../ui/ContextMenuItem";
import { folderDepth, folderKey, folderLabel, type FolderKey } from "./commandFolders";
import { placeChoices, scopesOf } from "./commandsModel";

interface SkillMoveItemsProps {
  targets: LpmCommand[];
  lists: LpmCommandLists;
  onMove: (to: FolderKey) => void;
}

const INDENT = 10;

// The places skills made in lpm can move to: No folder and each folder of each
// list, the one they're all in already checked.
export function SkillMoveItems({ targets, lists, onMove }: SkillMoveItemsProps) {
  const [first] = targets;
  if (!first) return null;
  const here = targets.every((c) => c.scope === first.scope && c.folder === first.folder)
    ? folderKey(first.scope, first.folder)
    : null;
  const titled = scopesOf(lists).length > 1;
  return (
    <>
      {placeChoices(first, lists).map(({ scope, folders }) => (
        <div key={scope}>
          {titled && (
            <div className="px-3 pb-0.5 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
              {scope === "project" ? "This project" : "Global"}
            </div>
          )}
          {folders.map((folder) => {
            const key = folderKey(scope, folder);
            const current = key === here;
            return (
              <ContextMenuItem
                key={key}
                icon={folder ? <Folder size={12} /> : <FolderMinus size={12} />}
                label={
                  <span style={{ paddingLeft: folder ? folderDepth(folder) * INDENT : 0 }}>
                    {folder ? folderLabel(folder) : "No folder"}
                  </span>
                }
                disabled={current}
                trailing={current ? <Check size={11} /> : undefined}
                onClick={() => onMove(key)}
              />
            );
          })}
        </div>
      ))}
    </>
  );
}
