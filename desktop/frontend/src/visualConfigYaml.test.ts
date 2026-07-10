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

describe("nested field preservation", () => {
  const original =
    [
      "name: app",
      "services:",
      "  web:",
      "    cmd: npm run dev",
      "    port: 3000",
      "    reuse: true",
      "  api: npm run api",
      "actions:",
      "  deploy:",
      "    cmd: ./deploy.sh",
      "    label: Deploy",
      "    emoji: 🚀",
      "    shortcut: cmd+d",
      "    inputs:",
      "      env:",
      "        label: Environment",
      "        type: select",
      "        options:",
      "          - staging",
      "          - prod",
      "    actions:",
      "      staging: ./deploy.sh staging",
    ].join("\n") + "\n";

  it("keeps unmodeled action keys when the claudeAccount changes", () => {
    const form = parseYaml(original);
    const out = YAML.parse(serializeToYaml({ ...form, claudeAccount: "acc-1" }, original));
    expect(out.actions.deploy.emoji).toBe("🚀");
    expect(out.actions.deploy.shortcut).toBe("cmd+d");
    expect(out.actions.deploy.actions).toEqual({ staging: "./deploy.sh staging" });
    expect(out.actions.deploy.cmd).toBe("./deploy.sh");
    expect(out.actions.deploy.label).toBe("Deploy");
    expect(out.claudeAccount).toBe("acc-1");
  });

  it("keeps unmodeled service keys and select-input options", () => {
    const form = parseYaml(original);
    const out = YAML.parse(serializeToYaml({ ...form, name: "renamed" }, original));
    expect(out.services.web.reuse).toBe(true);
    expect(out.services.web.port).toBe(3000);
    expect(out.actions.deploy.inputs.env.options).toEqual(["staging", "prod"]);
  });

  it("deletes a managed nested field emptied in the form but keeps unmodeled keys", () => {
    const form = parseYaml(original);
    const actions = form.actions.map((a) => (a.key === "deploy" ? { ...a, label: "" } : a));
    const out = YAML.parse(serializeToYaml({ ...form, actions }, original));
    expect(out.actions.deploy.label).toBeUndefined();
    expect(out.actions.deploy.emoji).toBe("🚀");
  });

  it("round-trips a string-shorthand entry as a string", () => {
    const form = parseYaml(original);
    const out = YAML.parse(serializeToYaml({ ...form, claudeAccount: "acc-1" }, original));
    expect(out.services.api).toBe("npm run api");
  });

  it("keeps an entry an object when its original carried unmanaged keys", () => {
    const src = "services:\n  web:\n    cmd: npm run dev\n    reuse: true\n";
    const form = parseYaml(src);
    const out = YAML.parse(serializeToYaml({ ...form, name: "x" }, src));
    expect(out.services.web).toEqual({ cmd: "npm run dev", reuse: true });
  });

  it("preserves unmanaged keys when a service key is renamed", () => {
    const form = parseYaml(original);
    const services = form.services.map((s) => (s.key === "web" ? { ...s, key: "backend" } : s));
    const out = YAML.parse(serializeToYaml({ ...form, services }, original));
    expect(out.services.web).toBeUndefined();
    expect(out.services.backend.reuse).toBe(true);
    expect(out.services.backend.port).toBe(3000);
    expect(out.services.backend.cmd).toBe("npm run dev");
  });

  it("preserves an action input's unmanaged keys when the input key is renamed", () => {
    const form = parseYaml(original);
    const actions = form.actions.map((a) =>
      a.key === "deploy"
        ? { ...a, inputs: a.inputs.map((inp) => (inp.key === "env" ? { ...inp, key: "environment" } : inp)) }
        : a,
    );
    const out = YAML.parse(serializeToYaml({ ...form, actions }, original));
    expect(out.actions.deploy.inputs.env).toBeUndefined();
    expect(out.actions.deploy.inputs.environment.options).toEqual(["staging", "prod"]);
    expect(out.actions.deploy.inputs.environment.label).toBe("Environment");
  });
});

describe("falsy managed scalars", () => {
  const original =
    [
      "actions:",
      "  deploy:",
      "    cmd: ./deploy.sh",
      "    emoji: 🚀",
      "    inputs:",
      "      count:",
      "        label: Count",
      "        default: 0",
    ].join("\n") + "\n";

  it("preserves default: 0 through an unrelated edit", () => {
    const form = parseYaml(original);
    expect(form.actions[0].inputs[0].default).toBe("0");
    const out = YAML.parse(serializeToYaml({ ...form, name: "renamed" }, original));
    expect(out.actions.deploy.inputs.count.default).toBe("0");
    expect(out.actions.deploy.emoji).toBe("🚀");
  });
});

describe("hasSsh", () => {
  it("is true for a doc with an ssh object and round-trips the ssh block", () => {
    const original =
      ["root: ~/x", "ssh:", "  host: example.com", "  user: deploy"].join("\n") + "\n";
    const form = parseYaml(original);
    expect(form.hasSsh).toBe(true);
    const out = YAML.parse(serializeToYaml({ ...form, name: "x" }, original));
    expect(out.ssh).toEqual({ host: "example.com", user: "deploy" });
  });

  it("is false when there is no ssh object", () => {
    expect(parseYaml("root: ~/x\n").hasSsh).toBe(false);
  });
});

describe("array-root fallback", () => {
  it("persists edits as a fresh mapping when the original is a sequence", () => {
    const original = "- one\n- two\n";
    const out = serializeToYaml({ ...parseYaml(original), name: "solo" }, original);
    expect(YAML.parse(out)).toEqual({ name: "solo" });
  });
});
