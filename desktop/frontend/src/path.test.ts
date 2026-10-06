import { describe, it, expect } from "vitest";
import {
  basename,
  commandName,
  dirname,
  fromMsysPath,
  isAbsolutePath,
  joinAbs,
  joinPath,
  normalizePath,
  relTo,
  runsWhenOpened,
  splitRoot,
  toSlash,
  uriPath,
} from "./path";
import { findAgreedSlug, stripArgs } from "./peer/router";

const HOST_ROOT = "/@peer-a1b2c3d4/home/ubuntu/app";

// Where a read of the joined path is sent: the host slug, or null for this Mac.
function readTarget(absPath: string): { slug: string | null; hostPath: string } {
  return { slug: findAgreedSlug({ absPath }), hostPath: stripArgs({ absPath }).absPath as string };
}

describe("joinAbs", () => {
  it("resolves a relative path against a local base", () => {
    expect(joinAbs("/Users/dev/app", "./src/a.ts")).toBe("/Users/dev/app/src/a.ts");
    expect(joinAbs("/Users/dev/app", "/etc/hosts")).toBe("/etc/hosts");
    expect(joinAbs("/Users/dev/app", "~/notes.md")).toBe("~/notes.md");
  });

  it("keeps a relative path on the host its base lives on", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "src/a.ts"))).toEqual({
      slug: "a1b2c3d4",
      hostPath: "/home/ubuntu/app/src/a.ts",
    });
  });

  it("keeps an absolute path on the host its base lives on", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "/var/log/app.log"))).toEqual({
      slug: "a1b2c3d4",
      hostPath: "/var/log/app.log",
    });
  });

  it("keeps a home-relative path on the host, for the host to expand", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "~/.lpm/memory/app/plan.md"))).toEqual({
      slug: "a1b2c3d4",
      hostPath: "~/.lpm/memory/app/plan.md",
    });
  });
});

describe("normalizePath", () => {
  it.each([
    ["/proj/api/../shared/util.ts", "/proj/shared/util.ts"],
    ["/proj/./src/../a.ts", "/proj/a.ts"],
    ["/a/../../b.ts", "/b.ts"],
    ["~/a/../b.md", "~/b.md"],
    ["~/../x.md", "~/../x.md"],
    ["../x.ts", "../x.ts"],
    ["/@peer-a1b2c3d4/home/app/../x.md", "/@peer-a1b2c3d4/home/x.md"],
    ["/@peer-a1b2c3d4~/notes/../a.md", "/@peer-a1b2c3d4~/a.md"],
    ["/@peer-a1b2c3d4/../x.md", "/@peer-a1b2c3d4/../x.md"],
    ["/proj//src/a.ts", "/proj/src/a.ts"],
  ])("%s → %s", (input, want) => {
    expect(normalizePath(input)).toBe(want);
  });
});

describe("Windows paths", () => {
  it.each([
    ["C:\\Users\\dev\\app", "src/a.ts", "C:\\Users\\dev\\app\\src\\a.ts"],
    ["C:\\Users\\dev\\app\\", ".\\src\\a.ts", "C:\\Users\\dev\\app\\src\\a.ts"],
    ["C:/Users/dev/app", "src\\a.ts", "C:/Users/dev/app/src/a.ts"],
    ["\\\\srv\\share\\app", "a.ts", "\\\\srv\\share\\app\\a.ts"],
    ["C:\\Users\\dev\\app", "D:\\other\\b.ts", "D:\\other\\b.ts"],
    ["C:\\Users\\dev\\app", "\\\\srv\\share\\b.ts", "\\\\srv\\share\\b.ts"],
    ["C:\\Users\\dev\\app", "~\\notes.md", "~\\notes.md"],
    ["C:\\Users\\dev\\app", "~/notes.md", "~/notes.md"],
  ])("joinAbs(%s, %s) → %s", (base, rel, want) => {
    expect(joinAbs(base, rel, true)).toBe(want);
  });

  it("keeps a paired host's paths POSIX", () => {
    expect(readTarget(joinAbs(HOST_ROOT, "src/a.ts", true)).hostPath).toBe("/home/ubuntu/app/src/a.ts");
    expect(normalizePath("/@peer-a1b2c3d4/home/app/../x.md", true)).toBe("/@peer-a1b2c3d4/home/x.md");
    expect(basename("/@peer-a1b2c3d4/home/a\\b.md", true)).toBe("a\\b.md");
  });

  it("does not treat a backslash as a separator off Windows", () => {
    expect(basename("/Users/dev/a\\b.ts", false)).toBe("a\\b.ts");
    expect(joinAbs("/Users/dev", "C:\\x.ts", false)).toBe("/Users/dev/C:\\x.ts");
    expect(isAbsolutePath("C:\\x.ts", false)).toBe(false);
  });

  it.each([
    ["C:\\Users\\dev\\app\\src\\a.ts", "C:\\Users\\dev\\app", "src/a.ts"],
    ["c:\\users\\DEV\\app\\src\\a.ts", "C:\\Users\\dev\\app\\", "src/a.ts"],
    ["C:/Users/dev/app/src/a.ts", "C:\\Users\\dev\\app", "src/a.ts"],
    ["C:\\Users\\dev\\apple\\a.ts", "C:\\Users\\dev\\app", "C:\\Users\\dev\\apple\\a.ts"],
  ])("relTo(%s, %s) → %s", (abs, root, want) => {
    expect(relTo(abs, root, true)).toBe(want);
  });

  it.each([
    ["C:\\proj\\api\\..\\shared\\util.ts", "C:\\proj\\shared\\util.ts"],
    ["C:\\a\\..\\..\\b.ts", "C:\\b.ts"],
    ["C:/proj/./src/../a.ts", "C:/proj/a.ts"],
    ["\\\\srv\\share\\x\\..\\..\\y.md", "\\\\srv\\share\\y.md"],
    ["src\\..\\..\\x.ts", "..\\x.ts"],
    ["~\\a\\..\\b.md", "~\\b.md"],
    ["C:\\proj\\\\src\\a.ts", "C:\\proj\\src\\a.ts"],
    ["src/../a.ts", "a.ts"],
  ])("normalizePath(%s) → %s", (input, want) => {
    expect(normalizePath(input, true)).toBe(want);
  });

  it("splits names and folders on either separator", () => {
    expect(basename("C:\\Users\\dev\\a.ts", true)).toBe("a.ts");
    expect(basename("C:/Users/dev/a.ts", true)).toBe("a.ts");
    expect(dirname("C:\\Users\\dev\\a.ts", true)).toBe("C:\\Users\\dev");
    expect(dirname("C:\\a.ts", true)).toBe("C:\\");
    expect(dirname("\\\\srv\\share\\a.ts", true)).toBe("\\\\srv\\share\\");
    expect(dirname("/Users/dev/a.ts", false)).toBe("/Users/dev");
    expect(dirname("/a.ts", false)).toBe("/");
  });

  it("recognises absolute forms", () => {
    for (const p of ["C:\\x", "c:/x", "\\\\srv\\share", "~\\x", "/c/x", "~/x", "~"]) {
      expect(isAbsolutePath(p, true)).toBe(true);
    }
    for (const p of ["src\\a.ts", "a.ts", "C:", "./a.ts"]) {
      expect(isAbsolutePath(p, true)).toBe(false);
    }
  });

  it("builds child paths with the parent's separator", () => {
    expect(joinPath("C:\\Users\\dev\\", "app", true)).toBe("C:\\Users\\dev\\app");
    expect(joinPath("C:\\", "app", true)).toBe("C:\\app");
    expect(joinPath("C:/Users/dev", "app", true)).toBe("C:/Users/dev/app");
    expect(joinPath("/Users/dev/", "app", false)).toBe("/Users/dev/app");
    expect(joinPath("/", "app", false)).toBe("/app");
  });

  it("maps MSYS drive paths to Windows ones", () => {
    expect(fromMsysPath("/c/Users/dev/a.ts")).toBe("C:\\Users\\dev\\a.ts");
    expect(fromMsysPath("/d")).toBe("D:\\");
    expect(fromMsysPath("/usr/bin/a.ts")).toBe("/usr/bin/a.ts");
  });

  it("maps the rest of Git Bash's tree given its mounts", () => {
    const mounts = { root: "C:\\Program Files\\Git", tmp: "C:\\Users\\me\\AppData\\Local\\Temp\\" };
    expect(fromMsysPath("/tmp/b-1/r.html", mounts)).toBe("C:\\Users\\me\\AppData\\Local\\Temp\\b-1\\r.html");
    expect(fromMsysPath("/tmp", mounts)).toBe("C:\\Users\\me\\AppData\\Local\\Temp");
    expect(fromMsysPath("/tmpdir/a.ts", mounts)).toBe("C:\\Program Files\\Git\\tmpdir\\a.ts");
    expect(fromMsysPath("/usr/share/a.txt", mounts)).toBe("C:\\Program Files\\Git\\usr\\share\\a.txt");
    expect(fromMsysPath("/etc/profile.sh", mounts)).toBe("C:\\Program Files\\Git\\etc\\profile.sh");
    expect(fromMsysPath("/bin/a.sh", mounts)).toBe("C:\\Program Files\\Git\\usr\\bin\\a.sh");
    expect(fromMsysPath("/c/x/a.ts", mounts)).toBe("C:\\x\\a.ts");
    expect(fromMsysPath("/@peer-a1b2c3d4/x/a.ts", mounts)).toBe("/@peer-a1b2c3d4/x/a.ts");
    expect(fromMsysPath("src/a.ts", mounts)).toBe("src/a.ts");
    expect(fromMsysPath("~/a.ts", mounts)).toBe("~/a.ts");
  });

  it("knows which files Windows runs when opened", () => {
    expect(runsWhenOpened("C:\\dl\\setup.exe", true)).toBe("binary");
    expect(runsWhenOpened("C:\\dl\\Setup.MSI", true)).toBe("binary");
    expect(runsWhenOpened("C:\\x\\app.lnk", true)).toBe("binary");
    for (const p of ["a.bat", "a.cmd", "a.ps1", "src\\index.js", "a.vbs", "a.wsf", "a.hta", "a.reg"]) {
      expect(runsWhenOpened(p, true)).toBe("script");
    }
    for (const p of ["a.md", "a.ts", "a.json", "a.exe.md", "a.html"]) {
      expect(runsWhenOpened(p, true)).toBeNull();
    }
    expect(runsWhenOpened("/Users/me/setup.exe", false)).toBeNull();
    expect(runsWhenOpened("/Users/me/run.cmd", false)).toBeNull();
  });

  it("splits a file outside any project into root and rest", () => {
    expect(splitRoot("C:\\docs\\a.md", true)).toEqual({ root: "C:\\", rest: "docs/a.md" });
    expect(splitRoot("/Users/dev/a.md", false)).toEqual({ root: "/", rest: "Users/dev/a.md" });
  });

  it("gives Monaco a URI path that keeps the whole file name", () => {
    expect(uriPath("C:\\Users\\dev\\a.ts", true)).toBe("/C:/Users/dev/a.ts");
    expect(uriPath("/Users/dev/a.ts", true)).toBe("/Users/dev/a.ts");
    expect(uriPath("/Users/dev/a.ts", false)).toBe("/Users/dev/a.ts");
  });

  it("names the program a command runs", () => {
    expect(commandName("/usr/local/bin/claude", false)).toBe("claude");
    expect(commandName("claude.exe", false)).toBe("claude.exe");
    expect(commandName("C:\\tools\\claude.exe", true)).toBe("claude");
    expect(commandName("codex.cmd", true)).toBe("codex");
    expect(commandName("/c/tools/codex", true)).toBe("codex");
  });

  it("converts backend-relative paths to forward slashes on Windows only", () => {
    expect(toSlash("src\\a.ts", true)).toBe("src/a.ts");
    expect(toSlash("src\\a.ts", false)).toBe("src\\a.ts");
  });
});

describe("Windows link safety and MSYS UNC paths", () => {
  it("treats shell and Python scripts as files Windows runs", () => {
    expect(runsWhenOpened("scripts/deploy.sh", true)).toBe("script");
    expect(runsWhenOpened("tools\\migrate.py", true)).toBe("script");
    expect(runsWhenOpened("README.md", true)).toBeNull();
    expect(runsWhenOpened("scripts/deploy.sh", false)).toBeNull();
  });

  it("maps MSYS //server/share to a UNC path, not under the Git install", () => {
    const mounts = { root: "C:\\Program Files\\Git", tmp: "C:\\Users\\u\\AppData\\Local\\Temp" };
    expect(fromMsysPath("//nas/builds/app/report.html", mounts)).toBe("\\\\nas\\builds\\app\\report.html");
    expect(fromMsysPath("/usr/share/x", mounts)).toBe("C:\\Program Files\\Git\\usr\\share\\x");
  });
});
