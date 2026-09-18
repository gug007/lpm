import { describe, expect, it } from "vitest";
import { decorate, decorationOf, underIgnored } from "./gitDecorations";

describe("decorate", () => {
  it("gives each changed file its status and every folder above it a status", () => {
    const map = decorate([{ path: "src/app/page.tsx", status: "modified" }]);
    expect(map.get("src/app/page.tsx")).toBe("modified");
    expect(map.get("src/app")).toBe("modified");
    expect(map.get("src")).toBe("modified");
    expect(map.has("")).toBe(false);
  });

  it("lets a modified file outweigh untracked siblings on the shared folders", () => {
    const map = decorate([
      { path: "src/new.ts", status: "untracked" },
      { path: "src/lib/old.ts", status: "modified" },
      { path: "docs/notes.md", status: "untracked" },
    ]);
    expect(map.get("src")).toBe("modified");
    expect(map.get("src/lib")).toBe("modified");
    expect(map.get("docs")).toBe("untracked");
    expect(map.get("src/new.ts")).toBe("untracked");
  });

  it("falls back to the modified look for a status it does not know", () => {
    expect(decorationOf("copied")).toBe(decorationOf("modified"));
    expect(decorationOf("deleted").strike).toBe(true);
  });
});

describe("underIgnored", () => {
  it("greys a path git ignored and everything below an ignored folder", () => {
    const ignored = new Set(["node_modules", "dist/app.js"]);
    expect(underIgnored("node_modules", ignored)).toBe(true);
    expect(underIgnored("node_modules/react/index.js", ignored)).toBe(true);
    expect(underIgnored("dist/app.js", ignored)).toBe(true);
    expect(underIgnored("dist", ignored)).toBe(false);
    expect(underIgnored("src/app.js", ignored)).toBe(false);
  });
});
