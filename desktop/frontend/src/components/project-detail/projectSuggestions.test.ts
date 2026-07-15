import { describe, expect, it } from "vitest";
import {
  buildSuggestions,
  detectPackageManager,
  filterStaticTemplates,
  parseJustfileRecipes,
  parseMakefileTargets,
  parsePackageJsonScripts,
  type ActionTemplate,
  type LockPresence,
  type SuggestionSources,
} from "./projectSuggestions";

const noLocks: LockPresence = {
  bun: false,
  pnpm: false,
  yarn: false,
  npm: false,
};

function sources(overrides: Partial<SuggestionSources> = {}): SuggestionSources {
  return {
    scripts: [],
    makeTargets: [],
    justRecipes: [],
    hasCompose: false,
    hasClaude: false,
    hasCodex: false,
    hasGemini: false,
    hasOpencode: false,
    hasCargo: false,
    hasGoMod: false,
    hasPyproject: false,
    hasUvLock: false,
    locks: noLocks,
    ...overrides,
  };
}

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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestion).toMatchObject({
      emoji: "🚢",
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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
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
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestion.id).toBe("scan-npm-run-dev");
  });
});

describe("suggestion emoji mapping", () => {
  it("maps common script names to distinct emoji", () => {
    const suggestions = buildSuggestions({
      scripts: [
        "clean",
        "format",
        "typecheck",
        "ios",
        "android",
        "migrate",
        "storybook",
        "e2e",
        "docs",
      ],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    const emojiFor = (name: string) =>
      suggestions.find((s) => s.name === name)?.emoji;
    expect(emojiFor("Clean")).toBe("🧹");
    expect(emojiFor("Format")).toBe("🎨");
    expect(emojiFor("Typecheck")).toBe("🔍");
    expect(emojiFor("Ios")).toBe("📱");
    expect(emojiFor("Android")).toBe("🤖");
    expect(emojiFor("Migrate")).toBe("🗃️");
    expect(emojiFor("Storybook")).toBe("📖");
    expect(emojiFor("E2e")).toBe("🎭");
    expect(emojiFor("Docs")).toBe("📚");
  });

  it("falls back to 🔧 for unrecognized names", () => {
    const [suggestion] = buildSuggestions({
      scripts: ["frobnicate"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestion.emoji).toBe("🔧");
  });

  it("applies the mapping to make targets too", () => {
    const [suggestion] = buildSuggestions({
      scripts: [],
      makeTargets: ["clean"],
      justRecipes: [],
      hasCompose: false,
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestion).toMatchObject({ cmd: "make clean", emoji: "🧹" });
  });
});

describe("filterStaticTemplates", () => {
  const staticTemplate = (id: string, cmd: string): ActionTemplate => ({
    id,
    emoji: "🔧",
    name: id,
    cmd,
    runMode: "once",
  });

  it("drops statics whose job a package-manager suggestion covers", () => {
    const statics = [
      staticTemplate("dev", "npm run dev"),
      staticTemplate("build", "npm run build"),
      staticTemplate("tests", "npm test"),
      staticTemplate("logs", "tail -f log.txt"),
    ];
    const suggestions = [
      staticTemplate("scan-1", "pnpm run dev"),
      staticTemplate("scan-2", "pnpm run build"),
    ];
    expect(
      filterStaticTemplates(statics, suggestions).map((t) => t.id),
    ).toEqual(["tests", "logs"]);
  });

  it("matches on the last word so make/just recipes count", () => {
    const statics = [
      staticTemplate("build", "npm run build"),
      staticTemplate("lint", "npm run lint -- --fix"),
      staticTemplate("tests", "npm test"),
    ];
    const suggestions = [
      staticTemplate("scan-1", "make build"),
      staticTemplate("scan-2", "just lint"),
    ];
    expect(
      filterStaticTemplates(statics, suggestions).map((t) => t.id),
    ).toEqual(["tests"]);
  });

  it("treats a start suggestion as covering the dev template", () => {
    const statics = [staticTemplate("dev", "npm run dev")];
    const suggestions = [staticTemplate("scan-1", "npm run start")];
    expect(filterStaticTemplates(statics, suggestions)).toEqual([]);
  });

  it("drops the docker template when a compose suggestion shares its command", () => {
    const statics = [
      staticTemplate("docker-up", "docker compose up -d"),
      staticTemplate("dev", "npm run dev"),
    ];
    const suggestions = [staticTemplate("scan-1", "docker compose up -d")];
    expect(
      filterStaticTemplates(statics, suggestions).map((t) => t.id),
    ).toEqual(["dev"]);
  });

  it("drops the install template when an install suggestion exists", () => {
    const statics = [staticTemplate("install", "npm install")];
    const suggestions = [staticTemplate("scan-1", "npm install")];
    expect(filterStaticTemplates(statics, suggestions)).toEqual([]);
  });

  it("keeps everything when there are no suggestions", () => {
    const statics = [
      staticTemplate("dev", "npm run dev"),
      staticTemplate("logs", "tail -f log.txt"),
    ];
    expect(filterStaticTemplates(statics, [])).toEqual(statics);
  });

  it("drops the AI coding session template but keeps Claude Ultracode", () => {
    const statics = [
      staticTemplate("ai-agent", "claude"),
      staticTemplate("claude-ultracode", `claude --settings '{"ultracode":true}'`),
    ];
    const suggestions = [staticTemplate("scan-claude", "claude")];
    expect(
      filterStaticTemplates(statics, suggestions).map((t) => t.id),
    ).toEqual(["claude-ultracode"]);
  });

  it("matches a job token past the last word so Go commands count", () => {
    const statics = [
      staticTemplate("build", "npm run build"),
      staticTemplate("tests", "npm test"),
      staticTemplate("dev", "npm run dev"),
    ];
    const suggestions = [
      staticTemplate("scan-1", "go build ./..."),
      staticTemplate("scan-2", "go test ./..."),
    ];
    expect(
      filterStaticTemplates(statics, suggestions).map((t) => t.id),
    ).toEqual(["dev"]);
  });

  it("drops the build template for cargo build", () => {
    const statics = [staticTemplate("build", "npm run build")];
    const suggestions = [staticTemplate("scan-1", "cargo build")];
    expect(filterStaticTemplates(statics, suggestions)).toEqual([]);
  });

  it("lets uv run pytest drop tests without touching dev", () => {
    const statics = [
      staticTemplate("tests", "npm test"),
      staticTemplate("dev", "npm run dev"),
    ];
    const suggestions = [staticTemplate("scan-1", "uv run pytest")];
    expect(
      filterStaticTemplates(statics, suggestions).map((t) => t.id),
    ).toEqual(["dev"]);
  });
});

describe("AI agent suggestions", () => {
  it("prepends Claude and Codex ahead of scripts when both are available", () => {
    const suggestions = buildSuggestions({
      scripts: ["dev"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      hasClaude: true,
      hasCodex: true,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestions.slice(0, 2)).toEqual([
      {
        id: "scan-claude",
        emoji: "🤖",
        name: "Claude Code",
        cmd: "claude",
        runMode: "terminal",
      },
      {
        id: "scan-codex",
        emoji: "🤖",
        name: "Codex",
        cmd: "codex",
        runMode: "terminal",
      },
    ]);
    expect(suggestions[2].cmd).toBe("npm run dev");
  });

  it("omits AI agents when the CLIs are unavailable", () => {
    const suggestions = buildSuggestions({
      scripts: ["dev"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      hasClaude: false,
      hasCodex: false,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestions.map((s) => s.cmd)).toEqual(["npm run dev"]);
  });

  it("keeps prepended AI agents within the nine-suggestion cap", () => {
    const suggestions = buildSuggestions({
      scripts: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
      makeTargets: [],
      justRecipes: [],
      hasCompose: false,
      hasClaude: true,
      hasCodex: true,
      hasGemini: false,
      hasOpencode: false,
      hasCargo: false,
      hasGoMod: false,
      hasPyproject: false,
      hasUvLock: false,
      locks: noLocks,
    });
    expect(suggestions).toHaveLength(9);
    expect(suggestions[0].cmd).toBe("claude");
    expect(suggestions[1].cmd).toBe("codex");
  });

  it("prepends all four agents in Claude, Codex, Gemini, OpenCode order", () => {
    const suggestions = buildSuggestions(
      sources({
        scripts: ["dev"],
        hasClaude: true,
        hasCodex: true,
        hasGemini: true,
        hasOpencode: true,
      }),
    );
    expect(suggestions.slice(0, 4).map((s) => s.cmd)).toEqual([
      "claude",
      "codex",
      "gemini",
      "opencode",
    ]);
    expect(suggestions.find((s) => s.cmd === "gemini")).toMatchObject({
      id: "scan-gemini",
      emoji: "🤖",
      name: "Gemini",
      runMode: "terminal",
    });
    expect(suggestions.find((s) => s.cmd === "opencode")).toMatchObject({
      id: "scan-opencode",
      name: "OpenCode",
      runMode: "terminal",
    });
    expect(suggestions[4].cmd).toBe("npm run dev");
  });

  it("omits Gemini and OpenCode when unavailable", () => {
    const suggestions = buildSuggestions(
      sources({ hasClaude: true, hasCodex: true }),
    );
    expect(suggestions.map((s) => s.cmd)).toEqual(["claude", "codex"]);
  });
});

describe("ecosystem suggestions", () => {
  it("adds Cargo Run/Test/Build for a Rust project", () => {
    const suggestions = buildSuggestions(sources({ hasCargo: true }));
    expect(suggestions).toEqual([
      {
        id: "scan-cargo-run",
        emoji: "🚀",
        name: "Run",
        cmd: "cargo run",
        runMode: "terminal",
        reuse: true,
      },
      {
        id: "scan-cargo-test",
        emoji: "🧪",
        name: "Test",
        cmd: "cargo test",
        runMode: "once",
        reuse: false,
      },
      {
        id: "scan-cargo-build",
        emoji: "📦",
        name: "Build",
        cmd: "cargo build",
        runMode: "once",
        reuse: false,
      },
    ]);
  });

  it("adds Go Run/Test/Build for a go.mod project", () => {
    const suggestions = buildSuggestions(sources({ hasGoMod: true }));
    expect(suggestions.map((s) => s.cmd)).toEqual([
      "go run .",
      "go test ./...",
      "go build ./...",
    ]);
    expect(suggestions[0]).toMatchObject({ runMode: "terminal", reuse: true });
  });

  it("uses plain pytest for pyproject without uv.lock", () => {
    const suggestions = buildSuggestions(sources({ hasPyproject: true }));
    expect(suggestions).toEqual([
      {
        id: "scan-pytest",
        emoji: "🧪",
        name: "Test",
        cmd: "pytest",
        runMode: "once",
        reuse: false,
      },
    ]);
  });

  it("uses uv run pytest when uv.lock is present", () => {
    const suggestions = buildSuggestions(
      sources({ hasPyproject: true, hasUvLock: true }),
    );
    expect(suggestions.map((s) => s.cmd)).toEqual(["uv run pytest"]);
  });

  it("places ecosystem defaults after scripts and before make targets", () => {
    const suggestions = buildSuggestions(
      sources({ scripts: ["dev"], hasCargo: true, makeTargets: ["ship"] }),
    );
    expect(suggestions.map((s) => s.cmd)).toEqual([
      "npm run dev",
      "cargo run",
      "cargo test",
      "cargo build",
      "make ship",
    ]);
  });

  it("keeps AI agents leading and honors the nine cap with ecosystem entries", () => {
    const suggestions = buildSuggestions(
      sources({
        scripts: ["a", "b", "c", "d", "e"],
        hasClaude: true,
        hasGoMod: true,
      }),
    );
    expect(suggestions).toHaveLength(9);
    expect(suggestions[0].cmd).toBe("claude");
  });
});
