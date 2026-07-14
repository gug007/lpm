import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  detectPackageManager,
  parseJustfileRecipes,
  parseMakefileTargets,
  parsePackageJsonScripts,
  type LockPresence,
} from "./projectSuggestions";

const noLocks: LockPresence = {
  bun: false,
  pnpm: false,
  yarn: false,
  npm: false,
};

describe("parsePackageJsonScripts", () => {
  it("returns script names in declaration order", () => {
    const content = JSON.stringify({
      scripts: { dev: "vite", build: "vite build", test: "vitest" },
    });
    expect(parsePackageJsonScripts(content)).toEqual(["dev", "build", "test"]);
  });

  it("returns [] for malformed JSON", () => {
    expect(parsePackageJsonScripts("{ not valid json")).toEqual([]);
  });

  it("returns [] when there is no scripts field", () => {
    expect(parsePackageJsonScripts(JSON.stringify({ name: "x" }))).toEqual([]);
  });

  it("ignores a non-object scripts field", () => {
    expect(parsePackageJsonScripts(JSON.stringify({ scripts: [] }))).toEqual([]);
    expect(
      parsePackageJsonScripts(JSON.stringify({ scripts: "nope" })),
    ).toEqual([]);
  });
});

describe("parseMakefileTargets", () => {
  it("collects plain targets and skips .PHONY, patterns, assignments, bodies", () => {
    const makefile = [
      "CFLAGS := -O2",
      ".PHONY: build test",
      "build: deps",
      "\tgcc -o out main.c",
      "test:",
      "\t./out",
      "%.o: %.c",
      "\tgcc -c $<",
      "src/thing:",
      ".hidden:",
    ].join("\n");
    expect(parseMakefileTargets(makefile)).toEqual(["build", "test"]);
  });

  it("splits multiple targets sharing one rule and dedupes", () => {
    const makefile = ["all lint:", "\techo hi", "lint:", "\techo again"].join(
      "\n",
    );
    expect(parseMakefileTargets(makefile)).toEqual(["all", "lint"]);
  });

  it("skips comments and blank lines", () => {
    const makefile = ["# a comment", "", "run:", "\tnode ."].join("\n");
    expect(parseMakefileTargets(makefile)).toEqual(["run"]);
  });
});

describe("parseJustfileRecipes", () => {
  it("collects recipe names and skips settings, assignments, comments, bodies", () => {
    const justfile = [
      "# comment",
      "set shell := ['bash', '-c']",
      "export FOO := 'bar'",
      "alias b := build",
      "build:",
      "    cargo build",
      "test target:",
      "    cargo test {{target}}",
      "[private]",
      "_hidden:",
      "    echo hi",
    ].join("\n");
    expect(parseJustfileRecipes(justfile)).toEqual([
      "build",
      "test",
      "_hidden",
    ]);
  });

  it("handles a recipe with dependencies and dedupes", () => {
    const justfile = ["deploy: build", "    ./ship", "deploy:", "    ./again"].join(
      "\n",
    );
    expect(parseJustfileRecipes(justfile)).toEqual(["deploy"]);
  });
});

describe("detectPackageManager", () => {
  it("prefers bun, then pnpm, then yarn, then npm", () => {
    expect(
      detectPackageManager({ bun: true, pnpm: true, yarn: true, npm: true }),
    ).toBe("bun");
    expect(
      detectPackageManager({ bun: false, pnpm: true, yarn: true, npm: true }),
    ).toBe("pnpm");
    expect(
      detectPackageManager({ bun: false, pnpm: false, yarn: true, npm: true }),
    ).toBe("yarn");
    expect(detectPackageManager(noLocks)).toBe("npm");
  });
});

describe("buildSuggestions", () => {
  it("special-cases dev/start/test/build/lint scripts", () => {
    const suggestions = buildSuggestions({
      scripts: ["dev", "start", "test", "build", "lint"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      locks: noLocks,
    });
    const dev = suggestions.find((s) => s.name === "Dev");
    expect(dev).toMatchObject({
      emoji: "🚀",
      cmd: "npm run dev",
      runMode: "terminal",
      reuse: true,
    });
    expect(suggestions.find((s) => s.name === "Start")?.emoji).toBe("🚀");
    expect(suggestions.find((s) => s.name === "Test")?.emoji).toBe("🧪");
    expect(suggestions.find((s) => s.name === "Build")?.emoji).toBe("📦");
    expect(suggestions.find((s) => s.name === "Lint")?.emoji).toBe("✨");
  });

  it("uses the detected package manager in script commands", () => {
    const [suggestion] = buildSuggestions({
      scripts: ["dev"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      locks: { bun: false, pnpm: true, yarn: false, npm: false },
    });
    expect(suggestion.cmd).toBe("pnpm run dev");
  });

  it("infers run mode and confirm for generic scripts", () => {
    const [suggestion] = buildSuggestions({
      scripts: ["deploy"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      locks: noLocks,
    });
    expect(suggestion).toMatchObject({
      emoji: "🔧",
      cmd: "npm run deploy",
      confirm: true,
    });
  });

  it("emits make, just, and compose suggestions after scripts", () => {
    const suggestions = buildSuggestions({
      scripts: ["dev"],
      makeTargets: ["ship"],
      justRecipes: ["fmt"],
      hasCompose: true,
      locks: noLocks,
    });
    expect(suggestions.map((s) => s.cmd)).toEqual([
      "npm run dev",
      "make ship",
      "just fmt",
      "docker compose up -d",
    ]);
  });

  it("dedupes repeated commands", () => {
    const suggestions = buildSuggestions({
      scripts: [],
      makeTargets: ["ship", "ship"],
      justRecipes: [],
      hasCompose: false,
      locks: noLocks,
    });
    expect(suggestions.map((s) => s.cmd)).toEqual(["make ship"]);
  });

  it("caps the combined list at nine, scripts first", () => {
    const suggestions = buildSuggestions({
      scripts: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      makeTargets: ["ship"],
      justRecipes: [],
      hasCompose: false,
      locks: noLocks,
    });
    expect(suggestions).toHaveLength(9);
    expect(suggestions.every((s) => s.cmd.startsWith("npm run "))).toBe(true);
    expect(suggestions.map((s) => s.cmd)).not.toContain("make ship");
  });

  it("gives suggestions scan-prefixed ids", () => {
    const [suggestion] = buildSuggestions({
      scripts: ["dev"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      locks: noLocks,
    });
    expect(suggestion.id).toBe("scan-npm-run-dev");
  });
});
