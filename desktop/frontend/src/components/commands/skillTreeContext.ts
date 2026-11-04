import { createContext, useContext, type MouseEvent } from "react";
import type { CommandScope, LpmCommand, LpmCommandLists } from "../../lpmCommands";
import type { FolderKey } from "./commandFolders";

// What every row of the Skills tree reads without each folder passing it down:
// the search, the keyboard's row, the skills picked for a bulk action, and what
// a skill's menu can do.

// What the menu of a skill made in lpm can do, to one skill or several.
export interface SkillMenuActions {
  lists: LpmCommandLists;
  // Open needs a file lpm can read; Reveal one on this computer.
  canOpen: (c: LpmCommand) => boolean;
  canReveal: (c: LpmCommand) => boolean;
  copyName: (c: LpmCommand) => void;
  duplicate: (c: LpmCommand) => void;
  move: (cs: LpmCommand[], to: FolderKey) => void;
  copyTo: (cs: LpmCommand[], scope: CommandScope) => void;
  keepOut: (cs: LpmCommand[], keep: boolean) => void;
  reveal: (c: LpmCommand) => void;
  open: (c: LpmCommand) => void;
  convert: (c: LpmCommand) => void;
  remove: (cs: LpmCommand[]) => void;
}

export interface SkillTreeState {
  query: string;
  now: number;
  // The row ↑ and ↓ are on while the search field has the keyboard.
  cursorKey: string | null;
  // Skills made in lpm picked for a bulk action, by commandKey.
  picked: ReadonlySet<string>;
  pickedSkills: LpmCommand[];
  // The skill open in the editor while it has changes not saved yet.
  unsavedKey: string | null;
  // A click on a skill made in lpm: true when ⌘ (Ctrl off macOS) or Shift made
  // it change the picks instead of opening the skill.
  pick: (c: LpmCommand, e: MouseEvent) => boolean;
  clearPicks: () => void;
  menu: SkillMenuActions;
}

const none = () => {};

const EMPTY_LISTS: LpmCommandLists = { global: { folders: [], commands: [] }, project: null, projectError: null };

const IDLE: SkillTreeState = {
  query: "",
  now: 0,
  cursorKey: null,
  picked: new Set(),
  pickedSkills: [],
  unsavedKey: null,
  pick: () => false,
  clearPicks: none,
  menu: {
    lists: EMPTY_LISTS,
    canOpen: () => false,
    canReveal: () => false,
    copyName: none,
    duplicate: none,
    move: none,
    copyTo: none,
    keepOut: none,
    reveal: none,
    open: none,
    convert: none,
    remove: none,
  },
};

export const SkillTreeContext = createContext<SkillTreeState>(IDLE);

export function useSkillTree(): SkillTreeState {
  return useContext(SkillTreeContext);
}
