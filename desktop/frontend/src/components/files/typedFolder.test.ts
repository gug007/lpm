import { describe, expect, it } from "vitest";
import { folderAbove } from "../../path";
import { asFolder, firstRow, folderRows, isTopLevel, splitTyped } from "./typedFolder";

const PEER = "/@peer-aabbccdd";

describe("a path typed so far", () => {
  it("splits at its last separator", () => {
    expect(splitTyped("/var/log/ap", false)).toEqual({ dir: "/var/log/", name: "ap" });
    expect(splitTyped("/var/log/", false)).toEqual({ dir: "/var/log/", name: "" });
    expect(splitTyped("../we", false)).toEqual({ dir: "../", name: "we" });
    expect(splitTyped("C:\\work\\a", true)).toEqual({ dir: "C:\\work\\", name: "a" });
    expect(splitTyped("/srv/a\\b", false)).toEqual({ dir: "/srv/", name: "a\\b" });
  });

  it("is typed on as a folder with the separator it uses", () => {
    expect(asFolder("/var/log", false)).toBe("/var/log/");
    expect(asFolder("/", false)).toBe("/");
    expect(asFolder("C:\\work", true)).toBe("C:\\work\\");
    expect(asFolder("C:/work", true)).toBe("C:/work/");
  });

  it("can be a project's folder when it is one name", () => {
    expect(["/bin", "/bin/"].every(isTopLevel)).toBe(true);
    expect(["/bin/sh", "~/bin", "../bin", "/"].some(isTopLevel)).toBe(false);
  });
});

describe("the folder above", () => {
  it("stops at the top, on this computer and a connected one", () => {
    expect(folderAbove("/var/log")).toBe("/var");
    expect(folderAbove("/var")).toBe("/");
    expect(folderAbove("/")).toBeNull();
    expect(folderAbove(`${PEER}/var`)).toBe(`${PEER}/`);
    expect(folderAbove(`${PEER}/`)).toBeNull();
    expect(folderAbove(`${PEER}C:\\work`)).toBe(`${PEER}C:\\`);
    expect(folderAbove(`${PEER}C:\\`)).toBeNull();
  });
});

describe("a folder's rows", () => {
  const entries = [
    { name: "api", isDir: true },
    { name: "nginx", isDir: true },
    { name: "Access.log", isDir: false },
  ];

  it("keep the computer they are on", () => {
    const rows = folderRows(`${PEER}/var/log`, entries, "");
    expect(rows.map((r) => r.path)).toEqual([
      `${PEER}/var`,
      `${PEER}/var/log/api`,
      `${PEER}/var/log/nginx`,
      `${PEER}/var/log/Access.log`,
    ]);
    expect(firstRow(rows)).toBe(1);
  });

  it("have no way up from the top, or while narrowed", () => {
    expect(folderRows("/", entries, "").map((r) => r.path)).toEqual(["/api", "/nginx", "/Access.log"]);
    expect(folderRows("/var", entries, "A").map((r) => r.name)).toEqual(["api", "Access.log"]);
    expect(folderRows("/var", entries, "gin").map((r) => r.name)).toEqual(["nginx"]);
    expect(firstRow([{ name: ".." }])).toBe(0);
  });
});
