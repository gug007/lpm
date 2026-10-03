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

  it("keep zones out of templates", () => {
    expect(templateSchema.properties).not.toHaveProperty("zones");
  });
});
