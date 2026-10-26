import { basename } from "../../path";
import type { ZoneInfo } from "../../types";
import { uniqueKey } from "../../uniqueKey";
import { parseLaunch } from "../agents/parse";
import { emitEvent } from "../ipc";
import { PLACEHOLDER } from "../seed/sample/folders";
import type {
  AgentKind,
  ReplyContext,
  Seed,
  SeedAction,
  SeedFolder,
  SeedGit,
  SeedProfile,
  SeedProject,
  SeedService,
  SeedSession,
} from "../seed/types";

export const HOME = "~";
export const GLOBAL = "__global__";

export interface Project {
  name: string;
  label?: string;
  root: string;
  remote: boolean;
  // The ~/.ssh/config host an SSH project was added from.
  sshHost?: string;
  parentName?: string;
  worktree: boolean;
  services: SeedService[];
  actions: SeedAction[];
  profiles: SeedProfile[];
  zones: ZoneInfo[];
  // The config as last saved, kept as written; unset until the first save.
  configText?: string;
  running: Set<string>;
  activeProfile: string;
  git: SeedGit;
  files: Record<string, string>;
  reply?: ReplyContext;
  session?: SeedSession;
}

export const projects = new Map<string, Project>();
const pickerQueue: string[] = [];
let seed: Seed;
let omitted: string[] = [];
let folders: SeedFolder[] = [];
let picked = 0;

const asFolder = (p: SeedProject): SeedFolder => ({
  name: p.name,
  files: p.files,
  services: p.services,
  actions: p.actions,
  profiles: p.profiles,
  git: p.git,
  reply: p.reply,
});

// Seeded projects a tour leaves out become folders it can add back; a folder
// the seed names explicitly wins over the project of the same name.
export function loadSeed(next: Seed, omit: string[] = []): void {
  seed = next;
  omitted = omit;
  projects.clear();
  for (const p of next.projects) if (!omit.includes(p.name)) projects.set(p.name, fromSeed(p));
  const named = new Set(next.folders.map((f) => f.name));
  const left = next.projects.filter((p) => omit.includes(p.name) && !named.has(p.name));
  folders = [...next.folders, ...left.map(asFolder)];
}

export function seedData(): Seed {
  return seed;
}

export function omittedProjects(): readonly string[] {
  return omitted;
}

export const cloneGit = (git: SeedGit): SeedGit => ({
  ...git,
  branches: git.branches.map((b) => ({ ...b })),
  changes: git.changes.map((c) => ({ ...c })),
});

function fromSeed(p: SeedProject): Project {
  return { ...build(p.name, p.root, asFolder(p)), label: p.label, session: p.session };
}

function build(name: string, root: string, folder: SeedFolder | undefined, remote = false): Project {
  return {
    name,
    root,
    remote,
    worktree: false,
    services: folder?.services.length ? folder.services : [PLACEHOLDER],
    actions: folder?.actions ?? [],
    profiles: folder?.profiles ?? [],
    zones: [],
    running: new Set(),
    activeProfile: "",
    git: cloneGit(folder?.git ?? CLEAN_GIT),
    files: { ...(folder?.files ?? { "README.md": `# ${name}\n` }) },
    reply: folder?.reply,
  };
}

const CLEAN_GIT: SeedGit = {
  branch: "main",
  upstream: true,
  ahead: 0,
  behind: 0,
  branches: [{ name: "main", ageMs: 3_600_000 }],
  changes: [],
};

// What lpm makes of a folder: the sample one by that name, or a bare folder
// with the placeholder service lpm writes when it detects nothing.
export function projectFromFolder(name: string, root: string, remote = false): Project {
  const base = basename(root) || name;
  return build(name, root, folders.find((f) => f.name === base), remote);
}

// The folder the next Local Folder pick returns: one a tour asked for, or the
// next addable folder in turn.
export function queueFolder(name: string): void {
  pickerQueue.push(name);
}

export function nextFolderName(): string {
  const queued = pickerQueue.shift();
  if (queued) return queued;
  const free = folders.filter((f) => ![...projects.values()].some((p) => p.root.endsWith(`/${f.name}`)));
  const pool = free.length ? free : folders;
  return pool.length ? pool[picked++ % pool.length].name : "my-app";
}

export function project(name: string): Project | undefined {
  return projects.get(name);
}

export function sshProject(host: string): Project | undefined {
  return [...projects.values()].find((p) => p.sshHost === host) ?? projects.get(host);
}

// The project a path belongs to: the one whose root it is or sits under.
export function projectAt(path: string): Project | undefined {
  let best: Project | undefined;
  for (const p of projects.values()) {
    if ((path === p.root || path.startsWith(`${p.root}/`)) && (!best || p.root.length > best.root.length)) {
      best = p;
    }
  }
  return best;
}

export function addProject(p: Project): Project {
  if (projects.has(p.name)) throw new Error(`project "${p.name}" already exists`);
  projects.set(p.name, p);
  changed();
  return p;
}

export function freeName(base: string): string {
  return uniqueKey(base, [...projects.keys()]);
}

export function changed(): void {
  emitEvent("projects-changed");
}

// An action runs an agent when its command launches one, as the app reads it.
export function agentAction(p: Project | undefined, kind: AgentKind): SeedAction | undefined {
  return p?.actions.find((a) => a.type === "terminal" && parseLaunch(a.cmd)?.kind === kind);
}

// What has happened in each project that leaves no other trace, so a tour can
// tell a step the visitor took themselves.
const happened = new Set<string>();

type Happening = "command" | "action" | "restart" | "review";

export function record(kind: Happening, projectName: string, what: string): void {
  happened.add(`${kind}:${projectName}:${what}`);
  emitEvent("demo-activity");
}

export function didHappen(kind: Happening, projectName: string, what: string): boolean {
  return happened.has(`${kind}:${projectName}:${what}`);
}
