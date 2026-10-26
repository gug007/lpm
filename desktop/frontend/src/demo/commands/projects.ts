import { joinPath } from "../../path";
import type { ActionInfo, ProjectInfo } from "../../types";
import type { CommandMap } from "../backend";
import type { SeedAction, SeedService } from "../seed/types";
import { stopServices } from "./services";
import {
  GLOBAL,
  HOME,
  addProject,
  changed,
  freeName,
  nextFolderName,
  project,
  projectFromFolder,
  projects,
  seedData,
  type Project,
} from "./state";
import { dropProjectStatus, statusEntries } from "./status";
import { configYaml, applyConfigYaml } from "./config";
import { wait } from "../wait";

const CLONE_MS = 1200;

// A menu child is named by its path, as lpm names it: `deploy:production`.
function actionInfo(a: SeedAction, position: number | undefined, path = a.name): ActionInfo {
  return {
    name: path,
    label: a.label,
    emoji: a.emoji,
    color: a.color,
    cmd: a.cmd,
    cwd: a.cwd,
    env: a.env,
    confirm: a.confirm ?? false,
    display: a.display,
    layer: a.layer,
    primary: a.primary,
    prompt: a.prompt,
    type: a.type,
    reuse: a.reuse ?? false,
    position,
    children: a.children?.map((c) => actionInfo(c, c.position, `${path}:${c.name}`)),
  };
}

// Seeded buttons keep the order they're declared in; a saved config's carry
// the positions it sets.
function info(p: Project): ProjectInfo {
  return {
    name: p.name,
    session: p.name,
    root: p.root,
    label: p.label,
    running: p.running.size > 0,
    services: p.services.filter((s) => p.running.has(s.name)).map((s) => serviceInfo(p, s)),
    allServices: p.services.map((s) => serviceInfo(p, s)),
    actions: p.actions.map((a, i) => actionInfo(a, p.configText === undefined ? i : a.position)),
    zones: p.zones,
    profiles: p.profiles,
    activeProfile: p.activeProfile,
    statusEntries: statusEntries(p.name),
    parentName: p.parentName,
    worktree: p.worktree,
    isRemote: p.remote,
  };
}

function serviceInfo(p: Project, s: SeedService) {
  return { name: s.name, cmd: s.cmd, cwd: p.root, port: s.port ?? 0, dependsOn: s.dependsOn };
}

function globalInfo(): ProjectInfo {
  return {
    name: GLOBAL,
    session: GLOBAL,
    root: HOME,
    running: false,
    services: [],
    allServices: [],
    actions: [],
    zones: [],
    profiles: [],
    activeProfile: "",
    statusEntries: statusEntries(GLOBAL),
    isRemote: false,
  };
}

const detected = (p: Project) => p.services.filter((s) => s.name !== "dev").map((s) => s.name);

function remove(names: string[]): null {
  for (const name of names) {
    stopServices(name);
    dropProjectStatus(name);
    projects.delete(name);
  }
  changed();
  return null;
}

export const projectCommands: CommandMap = {
  list_projects: () => [...projects.values()].map(info),
  get_project: ({ name }) => {
    if (name === GLOBAL) return globalInfo();
    const p = project(String(name));
    return p ? info(p) : null;
  },
  browse_folder: ({ defaultDir }) => joinPath(String(defaultDir || "~/Projects"), nextFolderName()),
  create_project: ({ name, root }) => {
    const existing = [...projects.values()].find((p) => p.root === root);
    if (existing) return { name: existing.name, existing: true, services: [] };
    const created = addProject(projectFromFolder(freeName(String(name)), String(root)));
    return { name: created.name, existing: false, services: detected(created) };
  },
  create_project_from_clone: ({ name, destParent }) =>
    wait(CLONE_MS).then(() =>
      detected(addProject(projectFromFolder(String(name), joinPath(String(destParent), String(name))))),
    ),
  create_ssh_project: ({ name, ssh }) => {
    const { host, user, dir } = ssh as { host?: string; user?: string; dir?: string };
    if (!host?.trim()) throw new Error("ssh host is required");
    if (!user?.trim()) throw new Error("ssh user is required");
    const p = projectFromFolder(String(name), dir?.trim() || HOME, true);
    p.sshHost = host;
    p.services = [{ name: "shell", cmd: "$SHELL -l", log: [{ text: `Last login on ${host}`, at: 400 }] }];
    addProject(p);
    return null;
  },
  list_ssh_hosts: () =>
    seedData().sshHosts.map((h) => ({
      name: h.alias,
      hostName: h.host,
      user: h.user,
      port: h.port,
      identityFile: "~/.ssh/id_ed25519",
    })),
  remove_project: ({ name }) => remove([String(name)]),
  remove_projects: ({ names }) => remove(names as string[]),
  remove_project_cascade: ({ name }) =>
    remove([...projects.values()].filter((p) => p.name === name || p.parentName === name).map((p) => p.name)),
  read_config: ({ name }) => {
    const p = project(String(name));
    return p ? configYaml(p) : "";
  },
  read_repo_config: ({ name }) => project(String(name))?.files[".lpm.yml"] ?? "",
  save_config: ({ name, content }) => {
    const p = project(String(name));
    if (p) applyConfigYaml(p, String(content));
    changed();
    return null;
  },
};
