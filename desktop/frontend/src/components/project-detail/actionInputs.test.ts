import { describe, expect, it } from "vitest";
import {
  commandSegments,
  commandTokens,
  inputDraftsFromInfos,
  inputProblem,
  inputsToYamlMap,
  insertToken,
  newInputDraft,
  removeToken,
  renameToken,
  resolveCommand,
  syncInputsToCommand,
} from "./actionInputs";
import type { InputDraft } from "./actionInputs";

const draft = (key: string, overrides: Partial<InputDraft> = {}) =>
  newInputDraft(key, { label: key, ...overrides });

describe("commandTokens", () => {
  it("returns distinct keys in the order they appear", () => {
    expect(commandTokens("./go.sh --env {{env}} --tag {{tag}} # {{env}}")).toEqual([
      "env",
      "tag",
    ]);
  });

  it("ignores braces that aren't a complete token", () => {
    expect(commandTokens("echo {{ env }} {{}} ${VAR} {{ok}}")).toEqual(["ok"]);
  });
});

describe("syncInputsToCommand", () => {
  it("adds a question for a hand-typed token", () => {
    const synced = syncInputsToCommand([], "deploy {{env}}");
    expect(synced.map((i) => i.key)).toEqual(["env"]);
    expect(synced[0].autoKey).toBe(false);
  });

  it("reorders questions to match the command", () => {
    const inputs = [draft("tag"), draft("env")];
    expect(
      syncInputsToCommand(inputs, "go --env {{env}} --tag {{tag}}").map(
        (i) => i.key,
      ),
    ).toEqual(["env", "tag"]);
  });

  it("keeps a question whose token was deleted, sorted last", () => {
    const inputs = [draft("tag"), draft("env")];
    const synced = syncInputsToCommand(inputs, "go --env {{env}}");
    expect(synced.map((i) => i.key)).toEqual(["env", "tag"]);
  });

  it("returns the same array when nothing moved, so state stays stable", () => {
    const inputs = [draft("env")];
    expect(syncInputsToCommand(inputs, "go {{env}}")).toBe(inputs);
  });
});

describe("token editing", () => {
  it("inserts at the caret and pads only where needed", () => {
    expect(insertToken("go --env  --tag x", "env", 9)).toEqual({
      cmd: "go --env {{env}} --tag x",
      caret: 16,
    });
  });

  it("appends when there is no caret", () => {
    expect(insertToken("go", "env", null).cmd).toBe("go {{env}}");
  });

  it("removes a token and collapses the gap it leaves", () => {
    expect(removeToken("go --env {{env}} --tag v1", "env")).toBe("go --env --tag v1");
  });

  it("renames every occurrence", () => {
    expect(renameToken("{{a}} then {{a}}", "a", "b")).toBe("{{b}} then {{b}}");
  });
});

describe("commandSegments", () => {
  it("substitutes defaults and marks them as filled", () => {
    const inputs = [draft("env", { default: "staging" })];
    expect(commandSegments("go --env {{env}}", inputs)).toEqual([
      { text: "go --env ", filled: false },
      { text: "staging", filled: true, key: "env" },
    ]);
  });

  it("prefers an answer over the default", () => {
    const inputs = [draft("env", { default: "staging" })];
    expect(resolveCommand("go {{env}}", inputs, { env: "production" })).toBe(
      "go production",
    );
  });

  it("falls back to the first choice, then the placeholder, then the key", () => {
    const choice = draft("env", {
      type: "radio",
      options: [{ id: "1", label: "", value: "staging" }],
    });
    expect(resolveCommand("{{env}}", [choice])).toBe("staging");
    expect(resolveCommand("{{tag}}", [draft("tag", { placeholder: "v1.0.0" })])).toBe(
      "v1.0.0",
    );
    expect(resolveCommand("{{tag}}", [draft("tag")])).toBe("tag");
  });

  it("masks a secret", () => {
    expect(resolveCommand("{{token}}", [draft("token", { type: "password" })])).toBe(
      "••••••",
    );
  });

  it("leaves a token with no question untouched", () => {
    expect(resolveCommand("go {{nope}}", [])).toBe("go {{nope}}");
  });
});

describe("inputsToYamlMap", () => {
  it("returns undefined when there are no questions", () => {
    expect(inputsToYamlMap([])).toBeUndefined();
  });

  it("writes only what departs from the defaults", () => {
    expect(inputsToYamlMap([draft("tag", { label: "Release tag" })])).toEqual({
      tag: { label: "Release tag" },
    });
  });

  it("drops a label that only repeats the key", () => {
    expect(inputsToYamlMap([draft("tag")])).toEqual({ tag: {} });
  });

  it("emits position only when the command order isn't alphabetical", () => {
    const alphabetical = inputsToYamlMap([draft("env"), draft("tag")]);
    expect(alphabetical).toEqual({ env: {}, tag: {} });

    const reordered = inputsToYamlMap([draft("tag"), draft("env")]);
    expect(reordered).toEqual({
      tag: { position: 1 },
      env: { position: 2 },
    });
  });

  it("writes choices as scalars unless they carry their own label", () => {
    const input = draft("env", {
      type: "radio",
      required: true,
      persist: true,
      default: "staging",
      options: [
        { id: "1", label: "", value: "staging" },
        { id: "2", label: "Production", value: "production" },
      ],
    });
    expect(inputsToYamlMap([input])).toEqual({
      env: {
        type: "radio",
        required: true,
        default: "staging",
        persist: true,
        options: ["staging", { label: "Production", value: "production" }],
      },
    });
  });

  it("skips a placeholder on a choice question, which has no field to hint", () => {
    const input = draft("env", {
      type: "radio",
      placeholder: "ignored",
      options: [{ id: "1", label: "", value: "staging" }],
    });
    expect(inputsToYamlMap([input])).toEqual({
      env: { type: "radio", options: ["staging"] },
    });
  });
});

describe("inputProblem", () => {
  it("flags a choice question with no choices", () => {
    expect(inputProblem(draft("env", { type: "radio" }))).toBe(
      "Add at least one choice",
    );
  });

  it("flags a default that isn't one of the choices", () => {
    const input = draft("env", {
      type: "radio",
      default: "prod",
      options: [{ id: "1", label: "", value: "staging" }],
    });
    expect(inputProblem(input)).toBe(
      "The starting choice is no longer in the list",
    );
  });

  it("passes a text question", () => {
    expect(inputProblem(draft("tag", { default: "v1" }))).toBeNull();
  });
});

describe("inputDraftsFromInfos", () => {
  it("round-trips through the YAML map", () => {
    const infos = [
      {
        key: "env",
        label: "Environment",
        type: "radio",
        required: true,
        placeholder: "",
        default: "staging",
        persist: true,
        options: [
          { label: "staging", value: "staging" },
          { label: "Production", value: "production" },
        ],
      },
    ];
    expect(inputsToYamlMap(inputDraftsFromInfos(infos))).toEqual({
      env: {
        label: "Environment",
        type: "radio",
        required: true,
        default: "staging",
        persist: true,
        options: ["staging", { label: "Production", value: "production" }],
      },
    });
  });
});
