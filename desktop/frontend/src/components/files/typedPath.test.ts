import { describe, expect, it } from "vitest";
import { inTree, typedPath } from "./typedPath";

describe("typedPath", () => {
  it("takes a rooted, home or dotted path", () => {
    for (const path of ["/var/log", "~/.config", "./src", "../other", "/api", "~/", "../"]) {
      expect(typedPath(path, false)).toBe(path);
    }
    expect(typedPath("  /var/log/a b.log ", false)).toBe("/var/log/a b.log");
  });

  it("leaves names, and a path not begun, to the filter", () => {
    for (const query of ["", "server.ts", "src/api", "/", "./", "~", ".env", "..", "C:\\x", "..env/a"]) {
      expect(typedPath(query, false)).toBeNull();
    }
  });

  it("takes Windows spellings for a project on Windows", () => {
    for (const path of ["C:\\work\\a.ts", "c:/work", "C:\\", "\\\\srv\\share", "~\\a", "..\\", ".\\src"]) {
      expect(typedPath(path, true)).toBe(path);
    }
  });
});

describe("inTree", () => {
  it("knows the folders the tree leaves out", () => {
    expect(inTree("src/api")).toBe(true);
    expect(inTree("")).toBe(true);
    expect(inTree(".git/hooks")).toBe(false);
    expect(inTree("vendor/lib/.git")).toBe(false);
  });
});
