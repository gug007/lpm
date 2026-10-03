import { describe, expect, it } from "vitest";
import repoSchema from "./repo-config.schema.json";
import { templateSchema } from "./templateSchema";

describe("template schema", () => {
  it("is the repo schema without zones", () => {
    expect(repoSchema.properties).toHaveProperty("zones");
    expect(templateSchema.properties).not.toHaveProperty("zones");
    const { zones: _zones, ...rest } = repoSchema.properties;
    expect(templateSchema.properties).toEqual(rest);
  });

  it("keeps every other part of the repo schema", () => {
    const { properties: _templateProperties, ...templateRest } = templateSchema;
    const { properties: _repoProperties, ...repoRest } = repoSchema;
    expect(templateRest).toEqual(repoRest);
  });
});
