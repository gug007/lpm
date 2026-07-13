import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { rewriteServiceRefs, stripServiceRefs } from "./serviceConfig";

const doc = (yaml: string) => YAML.parseDocument(yaml);

describe("rewriteServiceRefs", () => {
  it("rewrites profile refs to the new name", () => {
    const d = doc("services:\n  db: pg\n  api: go run .\nprofiles:\n  default: [db, api]\n");
    expect(rewriteServiceRefs(d, "db", "database")).toBe(true);
    expect(YAML.parse(String(d)).profiles.default).toEqual(["database", "api"]);
  });

  it("rewrites dependsOn refs in other services", () => {
    const d = doc(
      "services:\n  db: pg\n  api:\n    cmd: go run .\n    dependsOn: [db]\n",
    );
    expect(rewriteServiceRefs(d, "db", "database")).toBe(true);
    expect(YAML.parse(String(d)).services.api.dependsOn).toEqual(["database"]);
  });

  it("rewrites the depends_on alias too", () => {
    const d = doc("services:\n  db: pg\n  api:\n    cmd: go run .\n    depends_on: [db]\n");
    expect(rewriteServiceRefs(d, "db", "database")).toBe(true);
    expect(YAML.parse(String(d)).services.api.depends_on).toEqual(["database"]);
  });

  it("reports no change when the name is absent", () => {
    const d = doc("services:\n  db: pg\nprofiles:\n  default: [db]\n");
    expect(rewriteServiceRefs(d, "web", "www")).toBe(false);
  });
});

describe("stripServiceRefs", () => {
  it("removes profile refs to the deleted name", () => {
    const d = doc("services:\n  db: pg\n  api: go run .\nprofiles:\n  default: [db, api]\n");
    expect(stripServiceRefs(d, "db")).toBe(true);
    expect(YAML.parse(String(d)).profiles.default).toEqual(["api"]);
  });

  it("removes dependsOn refs to the deleted name", () => {
    const d = doc(
      "services:\n  db: pg\n  api:\n    cmd: go run .\n    dependsOn: [db, cache]\n",
    );
    expect(stripServiceRefs(d, "db")).toBe(true);
    expect(YAML.parse(String(d)).services.api.dependsOn).toEqual(["cache"]);
  });

  it("reports no change when the name is absent", () => {
    const d = doc("services:\n  db: pg\n  api:\n    cmd: go run .\n    dependsOn: [db]\n");
    expect(stripServiceRefs(d, "web")).toBe(false);
  });
});
