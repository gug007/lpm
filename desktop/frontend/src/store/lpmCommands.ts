import { useEffect } from "react";
import { create } from "zustand";
import {
  ConvertSkill,
  CreateLpmCommandFolder,
  DeleteLpmCommand,
  DeleteLpmCommandFolder,
  ExpandLpmCommand,
  ImportLpmCommands,
  ListLpmCommands,
  MoveOtherSkill,
  RenameLpmCommandFolder,
  SaveLpmCommand,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import type { AICLI } from "../types";
import type {
  CommandInput,
  CommandRef,
  CommandScope,
  ExpandedCommand,
  LpmCommandLists,
} from "../lpmCommands";

// Each project's lpm command lists (its own and the global one), keyed by the
// project name the composer and the Commands tab already have; the global
// Terminals pass their reserved name and get no project list. A list is read
// again when a change to it is announced, so the menu never offers a command
// a phone or another window just removed.

interface LpmCommandsState {
  byProject: Record<string, LpmCommandLists>;
  load: (project: string) => Promise<LpmCommandLists | null>;
  put: (project: string, lists: LpmCommandLists) => void;
}

// How long a read stands in for the files when the composer comes back into
// focus; a change made through lpm announces itself sooner than that.
const FRESH_MS = 30_000;

const inFlight = new Map<string, Promise<LpmCommandLists | null>>();
const readAt = new Map<string, number>();
// What each project's lists last read as, so an unchanged read keeps the same
// object and the menus built from it don't render again.
const readAs = new Map<string, string>();

export const useLpmCommandsStore = create<LpmCommandsState>((set, get) => ({
  byProject: {},
  load: (project) => {
    const pending = inFlight.get(project);
    if (pending) return pending;
    const run = (ListLpmCommands(project) as Promise<LpmCommandLists>)
      .then((lists) => {
        get().put(project, lists);
        return lists;
      })
      .catch(() => null)
      .finally(() => inFlight.delete(project));
    inFlight.set(project, run);
    return run;
  },
  put: (project, lists) => {
    readAt.set(project, Date.now());
    const text = JSON.stringify(lists);
    if (readAs.get(project) === text) return;
    readAs.set(project, text);
    set((s) => ({ byProject: { ...s.byProject, [project]: lists } }));
  },
}));

// The lists for `project`, read when first asked for and when `active` turns
// on again (the composer gaining focus) after a while, so files edited by hand
// show up.
export function useLpmCommandLists(project: string, active = true): LpmCommandLists | null {
  const lists = useLpmCommandsStore((s) => s.byProject[project] ?? null);
  useEffect(() => {
    if (active && Date.now() - (readAt.get(project) ?? 0) > FRESH_MS) {
      void useLpmCommandsStore.getState().load(project);
    }
  }, [project, active]);
  return lists;
}

// The event names the project whose own list changed, or "" (a paired Mac's
// arrives prefixed, ending "-") for the global list every project shows.
function refresh(project: unknown) {
  const { byProject, load } = useLpmCommandsStore.getState();
  if (typeof project === "string" && project in byProject) {
    void load(project);
    return;
  }
  for (const name of Object.keys(byProject)) void load(name);
}

const offChanged = EventsOn("lpm-commands-changed", refresh);

// Skills changed outside these lists, in Agent setup.
export function reloadLpmCommands() {
  refresh("");
}

import.meta.hot?.dispose(() => {
  if (typeof offChanged === "function") offChanged();
});

async function apply(project: string, call: Promise<unknown>): Promise<LpmCommandLists> {
  const lists = (await call) as LpmCommandLists;
  useLpmCommandsStore.getState().put(project, lists);
  return lists;
}

export function saveLpmCommand(project: string, command: CommandInput, previous: CommandRef | null) {
  return apply(project, SaveLpmCommand(project, command, previous));
}

export function deleteLpmCommand(project: string, target: CommandRef) {
  return apply(project, DeleteLpmCommand(project, target));
}

export function createLpmCommandFolder(project: string, scope: CommandScope, name: string) {
  return apply(project, CreateLpmCommandFolder(project, scope, name));
}

export function renameLpmCommandFolder(project: string, scope: CommandScope, name: string, newName: string) {
  return apply(project, RenameLpmCommandFolder(project, scope, name, newName));
}

export function deleteLpmCommandFolder(project: string, scope: CommandScope, name: string) {
  return apply(project, DeleteLpmCommandFolder(project, scope, name));
}

export function moveOtherSkill(
  project: string,
  scope: CommandScope,
  name: string,
  folder: string | null,
  root = false,
) {
  return apply(project, MoveOtherSkill(project, scope, name, folder, root));
}

export function convertSkill(project: string, scope: CommandScope, name: string, toLpm: boolean) {
  return apply(project, ConvertSkill(project, scope, name, toLpm));
}

export async function importLpmCommands(project: string, scope: CommandScope): Promise<number> {
  const result = (await ImportLpmCommands(project, scope)) as { imported: number; list: LpmCommandLists };
  useLpmCommandsStore.getState().put(project, result.list);
  return result.imported;
}

export function expandLpmCommand(
  project: string,
  name: string,
  args: string,
  cli?: AICLI,
): Promise<ExpandedCommand> {
  return ExpandLpmCommand(project, name, args, cli) as Promise<ExpandedCommand>;
}
