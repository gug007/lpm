import { describe, expect, it } from "vitest";
import YAML from "yaml";
import { parseYaml, serializeToYaml } from "./visualConfigYaml";

describe("serializeToYaml round-trip", () => {
  it("preserves parent_name, ssh, and unknown top-level keys", () => {
    const original =
      [
        "name: dup",
        "parent_name: base",
        "unknownKey: keep-me",
        "ssh:",
        "  host: example.com",
        "  user: deploy",
        "services:",
        "  web: npm run dev",
      ].join("\n") + "\n";
    const out = serializeToYaml(parseYaml(original), original);
    expect(YAML.parse(out)).toEqual(YAML.parse(original));
  });

  it("deletes a managed key when its form value becomes empty", () => {
    const original = "root: ~/x\nunknownKey: keep-me\nservices:\n  web: npm run dev\n";
    const form = parseYaml(original);
    const out = serializeToYaml({ ...form, services: [] }, original);
    const parsed = YAML.parse(out);
    expect(parsed.services).toBeUndefined();
    expect(parsed.unknownKey).toBe("keep-me");
    expect(parsed.root).toBe("~/x");
  });

  it("falls back to the form-only document when the original is unparseable", () => {
    const out = serializeToYaml({ ...parseYaml(""), name: "solo" }, ": : not yaml :");
    expect(YAML.parse(out)).toEqual({ name: "solo" });
  });
});

describe("claudeAccount tri-state", () => {
  it("maps an absent key to null and keeps it absent", () => {
    const original = "root: ~/x\n";
    const form = parseYaml(original);
    expect(form.claudeAccount).toBeNull();
    expect(YAML.parse(serializeToYaml(form, original))).toEqual({ root: "~/x" });
  });

  it("null with a parent deletes the key (inherit from parent)", () => {
    const original = "root: ~/x\nparent_name: base\nclaudeAccount: acc-1\n";
    const out = serializeToYaml({ ...parseYaml(original), claudeAccount: null }, original);
    const parsed = YAML.parse(out);
    expect(parsed.claudeAccount).toBeUndefined();
    expect(parsed.parent_name).toBe("base");
  });

  it("empty string with a parent writes an explicit default", () => {
    const original = "root: ~/x\nparent_name: base\nclaudeAccount: acc-1\n";
    const out = serializeToYaml({ ...parseYaml(original), claudeAccount: "" }, original);
    expect(YAML.parse(out).claudeAccount).toBe("");
  });

  it("empty string without a parent deletes the key", () => {
    const original = "root: ~/x\nclaudeAccount: acc-1\n";
    const out = serializeToYaml({ ...parseYaml(original), claudeAccount: "" }, original);
    expect(YAML.parse(out).claudeAccount).toBeUndefined();
  });

  it("a non-empty value is written through", () => {
    const original = "root: ~/x\n";
    const out = serializeToYaml({ ...parseYaml(original), claudeAccount: "acc-9" }, original);
    expect(YAML.parse(out).claudeAccount).toBe("acc-9");
  });

  it("round-trips an explicit empty default under a parent", () => {
    const original = "root: ~/x\nparent_name: base\nclaudeAccount: \"\"\n";
    const form = parseYaml(original);
    expect(form.claudeAccount).toBe("");
    expect(YAML.parse(serializeToYaml(form, original)).claudeAccount).toBe("");
  });
});
