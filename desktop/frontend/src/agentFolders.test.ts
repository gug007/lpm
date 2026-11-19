import { describe, expect, it } from "vitest";
import { folderChoices, withAgentFolders } from "./agentFolders";
import type { ProjectInfo } from "./types";

const project = (name: string, root: string, more: Partial<ProjectInfo> = {}) =>
  ({ name, root, isRemote: false, ...more }) as ProjectInfo;

describe("withAgentFolders", () => {
  it("gives each agent its own flag right after its name", () => {
    expect(withAgentFolders("claude --session-id x", ["/p/api"])).toBe("claude --add-dir=/p/api --session-id x");
    expect(withAgentFolders("codex -m o3", ["/p/api"])).toBe("codex --add-dir=/p/api -m o3");
    expect(withAgentFolders("gemini", ["/p/api", "/p/web"])).toBe(
      "gemini --include-directories=/p/api --include-directories=/p/web",
    );
  });

  it("quotes a path with spaces and leaves a later prompt alone", () => {
    expect(withAgentFolders(`claude "fix the login"`, ["/Users/me/My App"])).toBe(
      `claude --add-dir='/Users/me/My App' "fix the login"`,
    );
  });

  it("passes a home-relative root through $HOME, which the shell expands after =", () => {
    expect(withAgentFolders("claude", ["~/Projects/web"])).toBe(`claude --add-dir="$HOME"/Projects/web`);
    expect(withAgentFolders("codex", ["~/My Apps/web"])).toBe(`codex --add-dir="$HOME"/'My Apps/web'`);
  });

  it("changes nothing for other commands or a folder already given", () => {
    expect(withAgentFolders("opencode", ["/p/api"])).toBe("opencode");
    expect(withAgentFolders("npm test", ["/p/api"])).toBe("npm test");
    expect(withAgentFolders("claude --add-dir=/p/api", ["/p/api"])).toBe("claude --add-dir=/p/api");
    expect(withAgentFolders("claude", [])).toBe("claude");
  });
});

describe("folderChoices", () => {
  it("offers this computer's other projects only", () => {
    const projects = [
      project("web", "/p/web"),
      project("api", "/p/api"),
      project("box", "/srv/box", { isRemote: true }),
      project("old", "/p/old", { archived: true }),
    ];
    expect(folderChoices(projects, "web").map((p) => p.name)).toEqual(["api"]);
  });
});
