import { describe, expect, it } from "vitest";
import globalSchema from "./global-config.schema.json";
import projectSchema from "./project-config.schema.json";
import repoSchema from "./repo-config.schema.json";

const schemas = { project: projectSchema, repo: repoSchema, global: globalSchema };

type Def = { oneOf?: { properties?: Record<string, unknown> }[]; properties?: Record<string, unknown> };

function fieldsOf(def: Def): string[] {
  const object = def.oneOf ? def.oneOf.find((branch) => branch.properties) : def;
  return Object.keys(object?.properties ?? {}).sort();
}

const ACTION_FIELDS = [
  "actions", "cmd", "color", "confirm", "cwd", "display", "emoji", "env", "inputs", "label", "layer",
  "mode", "port", "portConflict", "position", "primary", "prompt", "reuse", "shortcut", "type",
].sort();

describe("config schemas", () => {
  it("describe actions, inputs and services the same way in every file", () => {
    for (const schema of [repoSchema, globalSchema]) {
      expect(schema.definitions.action).toEqual(projectSchema.definitions.action);
      expect(schema.definitions.actionInput).toEqual(projectSchema.definitions.actionInput);
    }
    expect(repoSchema.definitions.service).toEqual(projectSchema.definitions.service);
  });

  for (const [name, schema] of Object.entries(schemas)) {
    it(`list every action field the app reads in the ${name} file, for actions and terminals alike`, () => {
      expect(fieldsOf(schema.definitions.action)).toEqual(ACTION_FIELDS);
      expect(fieldsOf(schema.definitions.terminal)).toEqual(ACTION_FIELDS);
    });

    it(`list every input field the app reads in the ${name} file`, () => {
      expect(fieldsOf(schema.definitions.actionInput)).toEqual(
        ["default", "label", "options", "persist", "placeholder", "position", "required", "type"],
      );
    });

    it(`take sections only as mappings in the ${name} file`, () => {
      for (const section of ["services", "actions", "terminals"] as const) {
        const value = (schema.properties as Record<string, { type?: string; oneOf?: unknown }>)[section];
        if (!value) continue;
        expect(value.type).toBe("object");
        expect(value.oneOf).toBeUndefined();
      }
    });
  }

  it("list only the fields a service has", () => {
    expect(fieldsOf(projectSchema.definitions.service)).toEqual(
      ["cmd", "cwd", "dependsOn", "depends_on", "env", "port", "portConflict"],
    );
  });

  it("let a project file carry the status badge the app writes", () => {
    const status = projectSchema.properties.work_status;
    expect(status.required).toEqual(["state"]);
    expect(status.properties.state.enum).toEqual(["in_progress", "blocked", "done", "custom"]);
    expect(repoSchema.properties).not.toHaveProperty("work_status");
  });
});
