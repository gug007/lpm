import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { actionEntryToPayload, mergeActionPayload } from "./actionConfig";

const entry = (yaml: string) =>
  YAML.parseDocument(yaml).get("key", true) as unknown;

describe("actionEntryToPayload", () => {
  it("normalizes the scalar-string shorthand to { cmd }", () => {
    expect(actionEntryToPayload(entry("key: npm run dev"))).toEqual({
      cmd: "npm run dev",
    });
  });

  it("returns a mapping's fields, preserving unmanaged keys", () => {
    const payload = actionEntryToPayload(
      entry(
        "key:\n  cmd: npm run dev\n  env:\n    PORT: '3000'\n  inputs:\n    - name: branch\n  position: 4\n",
      ),
    );
    expect(payload).toEqual({
      cmd: "npm run dev",
      env: { PORT: "3000" },
      inputs: [{ name: "branch" }],
      position: 4,
    });
  });

  it("rejects an empty scalar", () => {
    expect(actionEntryToPayload(entry("key: ''"))).toBeNull();
  });
});

describe("mergeActionPayload", () => {
  it("applies set/remove while preserving env, inputs, and position", () => {
    const base = {
      cmd: "npm run dev",
      type: "terminal",
      env: { PORT: "3000" },
      inputs: [{ name: "branch" }],
      position: 4,
    };
    const merged = mergeActionPayload(base, {
      set: { label: "Dev", cmd: "npm start" },
      remove: ["type"],
    });
    expect(merged).toEqual({
      cmd: "npm start",
      label: "Dev",
      env: { PORT: "3000" },
      inputs: [{ name: "branch" }],
      position: 4,
    });
  });

  it("treats a null base as an empty object", () => {
    expect(
      mergeActionPayload(null, { set: { label: "New" }, remove: ["cmd"] }),
    ).toEqual({ label: "New" });
  });

  it("removes before it sets when a key appears in both", () => {
    expect(
      mergeActionPayload(
        { cmd: "old" },
        { set: { cmd: "new" }, remove: ["cmd"] },
      ),
    ).toEqual({ cmd: "new" });
  });
});
