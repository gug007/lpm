import { describe, expect, it } from "vitest";
import globalSchema from "./global-config.schema.json";
import projectSchema from "./project-config.schema.json";
import repoSchema from "./repo-config.schema.json";
import { templateSchema } from "./templateSchema";

describe("zone schemas", () => {
  it("let a zone sit in the header or the footer in every file", () => {
    for (const schema of [projectSchema, repoSchema, globalSchema]) {
      expect(schema.definitions.zone.properties.display).toMatchObject({ type: "string", enum: ["header", "footer"] });
      expect(schema.definitions.zone.additionalProperties).toBe(false);
    }
  });

  it("describe the zone the same way in every file", () => {
    expect(repoSchema.definitions.zone).toEqual(projectSchema.definitions.zone);
    expect(globalSchema.definitions.zone).toEqual(projectSchema.definitions.zone);
  });

  it("reject a zone name that is empty, reserved, or holds \":\" or \"/\" in every file", () => {
    for (const schema of [projectSchema, repoSchema, globalSchema]) {
      const names = schema.properties.zones.propertyNames;
      const valid = (name: string) => new RegExp(names.pattern).test(name);
      expect(["build", "header-tools", "my zone"].every(valid)).toBe(true);
      expect(["", "header", "footer", "menu", "button", "a:b", "a/b"].some(valid)).toBe(false);
      expect(names.errorMessage).toContain('"/"');
    }
  });

  describe("layers", () => {
    const schemas = { project: projectSchema, repo: repoSchema, global: globalSchema };

    for (const [name, schema] of Object.entries(schemas)) {
      it(`let a zone hold keyed layers with only a label and a position in the ${name} file`, () => {
        const layers = schema.definitions.zone.properties.layers;
        expect(layers).toMatchObject({ type: "object" });
        expect(layers.propertyNames.pattern).toBe("^[^:/]+$");
        expect(layers.additionalProperties).toMatchObject({ type: "object", additionalProperties: false });
        expect(Object.keys(layers.additionalProperties.properties).sort()).toEqual(["label", "position"]);
        expect(layers.additionalProperties.properties.label.type).toBe("string");
        expect(layers.additionalProperties.properties.position.type).toBe("number");
      });

      it(`let an action and a terminal name a layer by string in the ${name} file`, () => {
        const entries = JSON.stringify(schema).match(/"layer":\{"type":"string"/g) ?? [];
        expect(entries.length).toBeGreaterThanOrEqual(2);
      });
    }
  });

  it("keep zones out of templates", () => {
    expect(templateSchema.properties).not.toHaveProperty("zones");
  });
});
