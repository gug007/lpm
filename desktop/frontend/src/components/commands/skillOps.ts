import type { Dispatch, SetStateAction } from "react";
import { toast } from "../../notifications/toast";
import {
  allCommands,
  commandKey,
  commandRef,
  sameCommand,
  scopeList,
  type CommandInput,
  type CommandRef,
  type CommandScope,
  type LpmCommand,
  type LpmCommandLists,
} from "../../lpmCommands";
import { deleteLpmCommand, saveLpmCommand } from "../../store/lpmCommands";
import { parseFolderKey, type FolderKey } from "./commandFolders";
import { canKeepOutOfGit, isDirty, movedTo, type Draft } from "./commandsModel";
import { copyName } from "./skillNames";

// The changes a skill's menu and the bulk bar make, to one skill or several in
// turn. An editor showing one of them untouched follows it to where it went.

interface SkillOpsArgs {
  projectName: string;
  lists: LpmCommandLists;
  draft: Draft | null;
  setDraft: Dispatch<SetStateAction<Draft | null>>;
}

export function inputOf(c: LpmCommand): CommandInput {
  return { scope: c.scope, folder: c.folder, name: c.name, description: c.description, body: c.body };
}

const listName = (scope: CommandScope) => (scope === "global" ? "Global" : "this project");

const skillNames = (names: string[]) => names.map((n) => `/${n}`).join(", ");

// Runs `op` on each skill in turn, so one that fails leaves the rest done, and
// says what failed.
async function each(cs: LpmCommand[], op: (c: LpmCommand) => Promise<void>): Promise<void> {
  const failed: string[] = [];
  for (const c of cs) {
    try {
      await op(c);
    } catch (err) {
      failed.push(String(err));
    }
  }
  if (failed.length === 1) toast.error(failed[0]);
  else if (failed.length > 1) toast.error(`${failed.length} skills weren't changed. ${failed[0]}`);
}

export function skillOps({ projectName, lists, draft, setDraft }: SkillOpsArgs) {
  const untouched = (c: LpmCommand) => !!draft && sameCommand(draft.original, c) && !isDirty(draft, lists);
  const namesIn = (scope: CommandScope) =>
    new Set((scopeList(lists, scope)?.commands ?? []).map((c) => c.name.toLowerCase()));

  // Moves each skill to `to`, and answers with where they all are now.
  const move = async (cs: LpmCommand[], to: FolderKey): Promise<string[]> => {
    const landed: string[] = [];
    const kept: string[] = [];
    await each(cs, async (c) => {
      const moved = movedTo(c, to, lists);
      if (!moved) {
        if (parseFolderKey(to)?.scope !== c.scope) kept.push(c.name);
        else landed.push(commandKey(c));
        return;
      }
      const following = untouched(c);
      await saveLpmCommand(projectName, moved, commandRef(c));
      landed.push(commandKey(moved));
      if (following) {
        const keepOutOfGit = moved.scope === c.scope && !!c.keptOutOfGit;
        setDraft({ ...moved, keepOutOfGit, original: commandRef(moved) });
      }
    });
    if (kept.length > 0) {
      toast.info(`${skillNames(kept)} stayed where ${kept.length === 1 ? "it was" : "they were"}: the other list has the same name.`);
    }
    return landed;
  };

  const copyTo = async (cs: LpmCommand[], scope: CommandScope) => {
    const taken = namesIn(scope);
    const clashes: string[] = [];
    let copied = 0;
    await each(
      cs.filter((c) => c.scope !== scope),
      async (c) => {
        if (taken.has(c.name.toLowerCase())) {
          clashes.push(c.name);
          return;
        }
        await saveLpmCommand(projectName, { ...inputOf(c), scope }, null);
        taken.add(c.name.toLowerCase());
        copied++;
      },
    );
    if (copied > 0) toast.success(`Copied ${copied === 1 ? "1 skill" : `${copied} skills`} to ${listName(scope)}.`);
    if (clashes.length > 0) toast.info(`${listName(scope)} already has ${skillNames(clashes)}.`);
  };

  const keepOut = async (cs: LpmCommand[], keep: boolean) => {
    const changing = cs.filter((c) => canKeepOutOfGit(c, lists) && !!c.keptOutOfGit !== keep);
    await each(changing, async (c) => {
      const following = untouched(c);
      await saveLpmCommand(projectName, { ...inputOf(c), keepOutOfGit: keep }, commandRef(c));
      if (following) setDraft((d) => d && { ...d, keepOutOfGit: keep });
    });
    const committed = changing.filter((c) => c.tracked).length;
    if (keep && committed > 0) {
      const it = committed === 1 ? "it" : "them";
      toast.info(
        `Already committed: commit to remove ${it} from the repo. Past commits keep a copy, and other computers lose ${it} when they pull.`,
      );
    }
  };

  // A copy beside the skill under a free name; answers with it.
  const duplicate = async (c: LpmCommand): Promise<LpmCommand | null> => {
    const input = { ...inputOf(c), name: copyName(c.name, namesIn(c.scope)) };
    const next = await saveLpmCommand(projectName, input, null);
    return allCommands(next).find((made) => sameCommand(made, input)) ?? null;
  };

  const remove = async (targets: CommandRef[]) => {
    const removed: CommandRef[] = [];
    await each(
      targets.map((t) => allCommands(lists).find((c) => sameCommand(c, t))).filter((c) => !!c),
      async (c) => {
        await deleteLpmCommand(projectName, commandRef(c));
        removed.push(c);
      },
    );
    setDraft((d) => (d && removed.some((r) => sameCommand(r, d.original)) ? null : d));
  };

  return { move, copyTo, keepOut, duplicate, remove };
}
