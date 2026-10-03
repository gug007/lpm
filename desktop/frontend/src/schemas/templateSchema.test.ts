import { describe, expect, it } from "vitest";
import repoSchema from "./repo-config.schema.json";
import { templateSchema } from "./templateSchema";

describe("template schema", () => {
  it("holds only actions and terminals: the app reads nothing else from a template", () => {
    expect(Object.keys(templateSchema.properties).sort()).toEqual(["actions", "terminals"]);
    expect(templateSchema.properties.actions).toEqual(repoSchema.properties.actions);
    expect(templateSchema.properties.terminals).toEqual(repoSchema.properties.terminals);
  });

  it("keeps every other part of the repo schema", () => {
    const { properties: _templateProperties, ...templateRest } = templateSchema;
    const { properties: _repoProperties, ...repoRest } = repoSchema;
    expect(templateRest).toEqual(repoRest);
  });
});
