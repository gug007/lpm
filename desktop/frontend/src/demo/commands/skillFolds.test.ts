import { beforeAll, describe, expect, it } from "vitest";
import type { Seed } from "../seed/types";
import { lpmCommandCommands as commands } from "./lpmCommands";
import { loadSeed, projects } from "./state";

const project = "demo-folds";
const call = (name: string, args: Record<string, unknown>) => commands[name](args) as never;
const closed = () => (call("load_skill_folds", { project }) as { project: { closed: string[] } }).project.closed;

describe("demo skill folds", () => {
  beforeAll(() => {
    loadSeed({ projects: [], folders: [] } as unknown as Seed);
    projects.set(project, { root: "/tmp/demo-folds" } as never);
  });

  it("answers a read with nothing closed", () => {
    expect(call("load_skill_folds", { project })).toEqual({
      global: { closed: [], othersOpen: false },
      project: { closed: [], othersOpen: false },
    });
  });

  it("holds a click, so the tree doesn't spring back when the answer lands", () => {
    call("set_skill_fold", { project, scope: "project", folder: "Work", open: false });
    expect(closed()).toEqual(["Work"]);
    call("set_skill_fold", { project, scope: "project", folder: "Work", open: true });
    expect(closed()).toEqual([]);
  });

  it("keeps the Other skills group apart from the folders", () => {
    const answer = call("set_skill_fold", { project, scope: "global", folder: null, open: true });
    expect(answer).toMatchObject({ global: { closed: [], othersOpen: true } });
    call("set_skill_fold", { project, scope: "global", folder: null, open: false });
  });

  it("carries a fold through a rename and forgets it on a delete", () => {
    call("create_lpm_command_folder", { project, scope: "project", name: "Work" });
    call("create_lpm_command_folder", { project, scope: "project", name: "Work/Reviews" });
    call("set_skill_fold", { project, scope: "project", folder: "Work/Reviews", open: false });
    call("rename_lpm_command_folder", { project, scope: "project", name: "Work/Reviews", newName: "Work/Notes" });
    expect(closed()).toEqual(["Work/Notes"]);
    call("delete_lpm_command_folder", { project, scope: "project", name: "Work/Notes" });
    expect(closed()).toEqual([]);
  });

  it("answers with its folds in the lists, as the app does", () => {
    call("set_skill_fold", { project, scope: "project", folder: "Work", open: false });
    expect(call("list_lpm_commands", { project })).toMatchObject({ folds: { project: { closed: ["Work"] } } });
  });
});
