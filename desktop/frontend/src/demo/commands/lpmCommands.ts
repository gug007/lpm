import type { CommandMap } from "../backend";
import { emitEvent } from "../ipc";
import { folderAfterMove, folderParent, inTreeOrder, withParents } from "../../components/commands/commandFolders";
import { AUTO_VARIABLES, findCommand, isValidCommandName, promptVariables, sameCommand } from "../../lpmCommands";
import type { CommandInput, CommandRef, CommandScope, LpmCommand, LpmCommandLists, OtherSkill } from "../../lpmCommands";
import type { SeedLpmCommand } from "../seed/types";
import { GLOBAL, projects, seedData } from "./state";

// lpm skills in memory, by the rules the Rust side keeps (lpm_commands.rs):
// one name per list whatever its case, folders that stay when emptied, folders
// that are paths and take what's inside them along, and a project's own command
// ahead of a global one of the same name.

interface List {
  folders: string[];
  commands: LpmCommand[];
  others: OtherSkill[];
  inRepo: boolean;
}

let global: List | null = null;
const byProject = new Map<string, List>();

function hint(body: string): string {
  const { asks } = promptVariables(body);
  if (asks.length === 0 && body.includes("$ARGUMENTS")) return "<arguments>";
  return asks.map((a) => `<${a}>`).join(" ");
}

function fromSeed(seeded: SeedLpmCommand[], scope: CommandScope): List {
  return {
    folders: withParents(seeded.flatMap((c) => (c.folder ? [c.folder] : []))),
    commands: seeded.map((c) => ({
      ...c,
      scope,
      argumentHint: hint(c.body),
      keptOutOfGit: false,
      tracked: scope === "project",
    })),
    others: (seedData().lpmCommands?.others?.[scope] ?? []).map((o) => ({ ...o })),
    inRepo: scope === "project",
  };
}

function globalList(): List {
  global ??= fromSeed(seedData().lpmCommands?.global ?? [], "global");
  return global;
}

function projectList(project: string): List | null {
  if (!project || project === GLOBAL || !projects.has(project)) return null;
  let list = byProject.get(project);
  if (!list) {
    list = fromSeed(seedData().lpmCommands?.project ?? [], "project");
    byProject.set(project, list);
  }
  return list;
}

function listOf(project: string, scope: CommandScope): List {
  const list = scope === "global" ? globalList() : projectList(project);
  if (!list) throw new Error("This terminal isn't in a project.");
  return list;
}

const byName = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

function sorted(list: List) {
  return {
    inRepo: list.inRepo,
    folders: inTreeOrder([...list.folders].sort(byName)),
    others: [...list.others].sort((a, b) => byName(a.name, b.name)),
    commands: [...list.commands].sort((a, b) =>
        a.folder === b.folder
          ? byName(a.name, b.name)
          : a.folder === null
            ? 1
            : b.folder === null
              ? -1
              : byName(a.folder, b.folder),
      ),
  };
}

function lists(project: string): LpmCommandLists {
  const own = projectList(project);
  return { global: sorted(globalList()), project: own && sorted(own), projectError: null };
}

// "" when the global list changed, which every project shows; else the project.
function changed(project: string, ...touched: CommandScope[]): LpmCommandLists {
  emitEvent("lpm-commands-changed", touched.includes("global") ? "" : project);
  return lists(project);
}

function hasFolder(list: List, folder: string): boolean {
  return list.folders.some((f) => f.toLowerCase() === folder.toLowerCase());
}

function addFolder(list: List, folder: string) {
  list.folders = withParents([...list.folders, folder]);
}

// The folder `from` and what's inside it become `to`, null being the top of the list.
function moveFolder(list: List, from: string, to: string | null) {
  list.folders = withParents(list.folders.flatMap((f) => folderAfterMove(f, from, to) ?? []));
  for (const c of [...list.commands, ...list.others]) c.folder = folderAfterMove(c.folder ?? null, from, to);
}

function save(project: string, input: CommandInput, previous: CommandRef | null): LpmCommandLists {
  if (!isValidCommandName(input.name)) {
    throw new Error("Use lowercase letters, numbers and single hyphens for the name.");
  }
  if (!input.body.trim()) throw new Error("Write the prompt first.");
  const list = listOf(project, input.scope);
  const clash = list.commands.find(
    (c) => c.name.toLowerCase() === input.name.toLowerCase() && !sameCommand(c, previous),
  );
  if (clash) throw new Error(`/${clash.name} already exists in ${clash.folder ? `the ${clash.folder} folder` : "No folder"}.`);
  let before: LpmCommand | undefined;
  if (previous) {
    const from = listOf(project, previous.scope);
    before = from.commands.find((c) => sameCommand(c, previous));
    from.commands = from.commands.filter((c) => !sameCommand(c, previous));
  }
  const keptOutOfGit = list.inRepo && (input.keepOutOfGit ?? !!before?.keptOutOfGit);
  if (input.folder) addFolder(list, input.folder);
  list.commands.push({
    name: input.name,
    folder: input.folder,
    description: input.description.trim(),
    body: input.body.trim(),
    scope: input.scope,
    argumentHint: hint(input.body),
    keptOutOfGit,
    tracked: list.inRepo && !keptOutOfGit && !!before?.tracked,
  });
  return changed(project, input.scope, ...(previous ? [previous.scope] : []));
}

// A word of the arguments for each variable, the last taking the rest as written.
function positional(args: string, n: number): string[] {
  const out: string[] = [];
  let rest = args.trim();
  while (out.length + 1 < n && rest) {
    const word = /^\S+/.exec(rest)![0];
    out.push(word);
    rest = rest.slice(word.length).trimStart();
  }
  if (n > 0 && rest) out.push(rest);
  return out;
}

function commandDir(project: string, c: LpmCommand): string {
  const root = c.scope === "project" ? `${projects.get(project)?.root}/.agents/skills` : "~/.agents/skills";
  return `${root}/${c.name}`;
}

function expand(project: string, name: string, args: string) {
  const command = findCommand(lists(project), name.replace(/^\//, ""));
  if (!command) throw new Error(`/${name} isn't one of your skills.`);
  const { asks } = promptVariables(command.body);
  const values = positional(args, asks.length);
  const auto: Record<string, string | undefined> = {
    branch: projects.get(project)?.git.branch,
    project: projects.get(project)?.label ?? (projects.has(project) ? project : undefined),
    dir: commandDir(project, command),
  };
  const missing: string[] = [];
  let text = command.body.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (token, v: string) => {
    const value = (AUTO_VARIABLES as readonly string[]).includes(v) ? auto[v] : values[asks.indexOf(v)];
    if (value === undefined && !missing.includes(v)) missing.push(v);
    return value ?? token;
  });
  const takesAll = text.includes("$ARGUMENTS");
  text = text.split("$ARGUMENTS").join(args.trim());
  if (args.trim() && asks.length === 0 && !takesAll) text = `${text.trimEnd()}\n\n${args.trim()}`;
  return { text, missing };
}

const str = (v: unknown) => String(v ?? "");

export const lpmCommandCommands: CommandMap = {
  list_lpm_commands: ({ project }) => lists(str(project)),
  save_lpm_command: ({ project, command, previous }) =>
    save(str(project), command as CommandInput, (previous as CommandRef | null) ?? null),
  delete_lpm_command: ({ project, target }) => {
    const t = target as CommandRef;
    const list = listOf(str(project), t.scope);
    list.commands = list.commands.filter((c) => !sameCommand(c, t));
    return changed(str(project), t.scope);
  },
  create_lpm_command_folder: ({ project, scope, name }) => {
    const list = listOf(str(project), scope as CommandScope);
    const folder = str(name).trim();
    if (hasFolder(list, folder)) throw new Error(`A folder named ${folder} already exists.`);
    addFolder(list, folder);
    return changed(str(project), scope as CommandScope);
  },
  rename_lpm_command_folder: ({ project, scope, name, newName }) => {
    const list = listOf(str(project), scope as CommandScope);
    const to = str(newName).trim();
    if (to.toLowerCase() !== str(name).toLowerCase() && hasFolder(list, to)) {
      throw new Error(`A folder named ${to} already exists.`);
    }
    moveFolder(list, str(name), to);
    return changed(str(project), scope as CommandScope);
  },
  delete_lpm_command_folder: ({ project, scope, name }) => {
    const list = listOf(str(project), scope as CommandScope);
    moveFolder(list, str(name), folderParent(str(name)));
    return changed(str(project), scope as CommandScope);
  },
  move_other_skill: ({ project, scope, name, folder, root }) => {
    const list = listOf(str(project), scope as CommandScope);
    const other = list.others.find((o) => o.name === name);
    if (!other) throw new Error(`/${str(name)} isn't in this list any more.`);
    other.folder = (folder as string | null) ?? null;
    other.atRoot = !other.folder && root === true;
    if (other.folder) addFolder(list, other.folder);
    return changed(str(project), scope as CommandScope);
  },
  convert_skill: ({ project, scope, name, toLpm }) => {
    const list = listOf(str(project), scope as CommandScope);
    if (toLpm) {
      const other = list.others.find((o) => o.name === name);
      if (!other) throw new Error(`/${str(name)} isn't in this list any more.`);
      list.others = list.others.filter((o) => o !== other);
      list.commands.push({
        name: other.name,
        folder: other.folder ?? null,
        description: other.description,
        body: other.preview,
        scope: scope as CommandScope,
        argumentHint: hint(other.preview),
      });
    } else {
      const command = list.commands.find((c) => c.name === name);
      if (!command) throw new Error(`/${str(name)} isn't in this list any more.`);
      list.commands = list.commands.filter((c) => c !== command);
      list.others.push({
        name: command.name,
        description: command.description,
        preview: command.body,
        agents: ["claude", "codex", "gemini", "opencode"],
        path: `.agents/skills/${command.name}/SKILL.md`,
        folder: command.folder,
      });
    }
    return changed(str(project), scope as CommandScope);
  },
  import_lpm_commands: ({ project }) => ({ imported: 0, list: lists(str(project)) }),
  expand_lpm_command: ({ project, name, args }) => expand(str(project), str(name), str(args)),
};
