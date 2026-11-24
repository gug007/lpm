// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocatedPath } from "../../locate";

const mocks = vi.hoisted(() => ({
  locate: vi.fn(),
  list: vi.fn(),
  projects: [] as { root: string; isRemote: boolean; sshHost?: string }[],
}));

vi.mock("../../locate", () => ({ locatePath: mocks.locate, listFolder: mocks.list }));
vi.mock("../terminal/pathLinkProvider", () => ({
  resolvePrinted: (root: string, path: string) => (path.startsWith("./") ? `${root}/${path.slice(2)}` : path),
}));
vi.mock("../terminal/msysMounts", () => ({ msysMounts: () => Promise.resolve(null) }));
vi.mock("../../store/app", () => ({
  useAppStore: (pick: (s: unknown) => unknown) => pick({ projects: mocks.projects }),
}));
vi.mock("../../store/fileViewer", () => ({ openFileViewer: vi.fn() }));

import { openFileViewer } from "../../store/fileViewer";
import { useTypedPathRow } from "./useTypedPathRow";

const onActivate = vi.fn();
const onQuery = vi.fn();
let matches = { hasMatches: false, holdsQuery: false };
let container: HTMLDivElement;
let root: Root;
let latest: ReturnType<typeof useTypedPathRow>;

function Probe({ query, hasMatches, holdsQuery }: { query: string; hasMatches: boolean; holdsQuery: boolean }) {
  matches = { hasMatches, holdsQuery };
  latest = useTypedPathRow({ root: "/repo", query, onQuery, enabled: true, hasMatches, holdsQuery, onActivate });
  return <>{latest.row}</>;
}

const at = (kind: LocatedPath["kind"], path: string, rel: string | null): LocatedPath => ({ kind, path, rel });
const render = (query: string, hasMatches = false, holdsQuery = hasMatches) =>
  act(async () => root.render(<Probe query={query} hasMatches={hasMatches} holdsQuery={holdsQuery} />));
const pause = () => act(async () => void (await vi.advanceTimersByTimeAsync(400)));
const text = () => container.textContent ?? "";

async function enter() {
  let took = false;
  const otherwise = vi.fn();
  const focusList = vi.fn();
  await act(async () => {
    took = latest.onEnter({ openBest: otherwise, focusList });
    await vi.advanceTimersByTimeAsync(0);
  });
  return { took, otherwise, focusList };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.projects = [];
  mocks.list.mockResolvedValue([]);
  onQuery.mockImplementation((query: string) => root.render(<Probe query={query} {...matches} />));
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
});

describe("a typed path", () => {
  it("leaves names to the filter", async () => {
    await render("server.ts");
    await pause();
    expect(mocks.locate).not.toHaveBeenCalled();
    expect(text()).toBe("");
    expect((await enter()).took).toBe(false);
  });

  it("opens a project file here", async () => {
    mocks.locate.mockResolvedValue(at("file", "/repo/build/report.html", "build/report.html"));
    await render("/repo/build/report.html");
    await pause();
    expect(text()).toContain("report.html");
    expect(text()).toContain("build");
    expect((await enter()).took).toBe(true);
    expect(onActivate).toHaveBeenCalledWith({ path: "build/report.html", isDir: false }, { focusEditor: true });
  });

  it("opens the tree on a project folder, and lists nothing under it", async () => {
    mocks.locate.mockResolvedValue(at("dir", "/repo/src/api", "src/api"));
    await render("./src/api");
    await pause();
    expect(mocks.locate).toHaveBeenCalledWith("/repo", "/repo/src/api");
    expect(text()).toContain("Show in tree");
    await enter();
    expect(onActivate).toHaveBeenCalledWith({ path: "src/api", isDir: true }, { focusEditor: true });
    expect(latest.folder).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("opens a file outside the project in the viewer", async () => {
    mocks.locate.mockResolvedValue(at("file", "/etc/hosts", null));
    await render("/etc/hosts");
    await pause();
    await enter();
    expect(openFileViewer).toHaveBeenCalledWith(
      expect.objectContaining({ absPath: "/etc/hosts", projectRoot: "/repo", onHost: false }),
    );
  });

  it("opens an SSH project's path on its host, sent as typed", async () => {
    mocks.projects = [{ root: "/repo", isRemote: true, sshHost: "staging" }];
    mocks.locate.mockResolvedValue(at("file", "/var/log/api.log", null));
    await render("./../log");
    await pause();
    expect(mocks.locate).toHaveBeenCalledWith("/repo", "./../log");
    await enter();
    expect(openFileViewer).toHaveBeenCalledWith(expect.objectContaining({ onHost: true }));
  });

  it("answers Enter before the pause is over, once", async () => {
    mocks.locate.mockResolvedValue(at("file", "/repo/a.ts", "a.ts"));
    await render("/repo/a.ts");
    expect(text()).toBe("Looking…");
    await enter();
    expect(onActivate).toHaveBeenCalledTimes(1);
    await pause();
    expect(mocks.locate).toHaveBeenCalledTimes(1);
  });

  it("says when nothing is there, and lets Enter open the best match", async () => {
    mocks.projects = [{ root: "/repo", isRemote: true, sshHost: "staging" }];
    mocks.locate.mockResolvedValue(at("missing", "/api", null));
    await render("/api", true);
    expect(text()).toBe("");
    const { took, otherwise } = await enter();
    expect(took).toBe(true);
    expect(otherwise).toHaveBeenCalledTimes(1);
    expect(latest.headline).toBe("Nothing at “/api” on staging");
    expect(text()).toBe("");
    expect((await enter()).took).toBe(false);
  });

  it("drops an answer the box has moved on from", async () => {
    let answer: (found: LocatedPath) => void = () => {};
    mocks.locate.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await render("/repo/a.ts");
    await pause();
    await render("/repo/a.tsx");
    mocks.locate.mockResolvedValue(at("missing", "/repo/a.tsx", null));
    await pause();
    await act(async () => answer(at("file", "/repo/a.ts", "a.ts")));
    expect(latest.headline).toContain("/repo/a.tsx");
    expect(text()).toBe("");
  });

  it("filters as before on a computer too old to be asked", async () => {
    mocks.locate.mockRejectedValue("Command locate_path not found");
    await render("/repo/a.ts");
    await pause();
    expect(text()).toBe("");
    expect(latest.headline).toBeUndefined();
    expect((await enter()).took).toBe(false);
  });

  it("says why a host couldn't be asked", async () => {
    mocks.projects = [{ root: "/repo", isRemote: true, sshHost: "staging" }];
    mocks.locate.mockRejectedValue("ssh: Operation timed out");
    await render("/var/log/x");
    await pause();
    expect(latest.headline).toBe("Couldn't look for “/var/log/x” on staging: ssh: Operation timed out");
  });
});

describe("a folder outside the project", () => {
  const FOLDERS: Record<string, { name: string; isDir: boolean }[]> = {
    "/": [{ name: "var", isDir: true }, { name: "vmlinuz", isDir: false }],
    "/var": [{ name: "log", isDir: true }],
    "/var/log": [
      { name: "syslog", isDir: false },
      { name: "api", isDir: true },
      { name: "old-api.gz", isDir: false },
    ],
    "/var/log/api": [{ name: "error.log", isDir: false }],
    "/bin": [{ name: "sh", isDir: false }],
  };
  const trim = (path: string) => path.replace(/(.)\/$/, "$1");
  const names = () => latest.folder?.rows.map((r) => r.name);
  const openRow = async (name: string) => {
    const found = latest.folder!.rows.find((r) => r.name === name)!;
    await act(async () => latest.folder!.onOpen(found));
    await pause();
  };

  beforeEach(() => {
    mocks.locate.mockImplementation(async (_root: string, path: string) => {
      const full = trim(path);
      if (full === "/repo") return at("dir", full, "");
      if (FOLDERS[full]) return at("dir", full, null);
      const cut = full.lastIndexOf("/");
      const isFile = FOLDERS[full.slice(0, cut) || "/"]?.some((e) => e.name === full.slice(cut + 1));
      return isFile ? at("file", full, null) : at("missing", full, null);
    });
    mocks.list.mockImplementation(async (_root: string, path: string) => {
      if (!FOLDERS[path]) throw "Permission denied";
      return FOLDERS[path];
    });
  });

  it("is listed under its row, folders first, with a way up", async () => {
    await render("/var/log");
    await pause();
    expect(text()).toContain("log");
    expect(text()).toContain("Outside the project");
    expect(names()).toEqual(["..", "api", "old-api.gz", "syslog"]);
    expect(latest.folder?.rows[1].path).toBe("/var/log/api");
    expect(mocks.list).toHaveBeenCalledWith("/repo", "/var/log");
  });

  it("takes Enter as far as its separator, then to the list", async () => {
    await render("/var/log");
    await pause();
    const first = await enter();
    expect(first.took).toBe(true);
    expect(onQuery).toHaveBeenLastCalledWith("/var/log/");
    expect(first.focusList).not.toHaveBeenCalled();
    await pause();
    const second = await enter();
    expect(second.focusList).toHaveBeenCalledTimes(1);
    expect(onQuery).toHaveBeenCalledTimes(1);
    expect(mocks.list).toHaveBeenCalledTimes(1);
  });

  it("narrows to what is typed on, names that start with it first", async () => {
    await render("/var/log/");
    await pause();
    await render("/var/log/AP");
    expect(names()).toEqual(["api", "old-api.gz"]);
    await pause();
    expect(names()).toEqual(["api", "old-api.gz"]);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    await enter();
    expect(onQuery).toHaveBeenLastCalledWith("/var/log/api/");
    await pause();
    expect(names()).toEqual(["..", "error.log"]);
  });

  it("lists the folder a name is typed in without it being listed first", async () => {
    await render("/var/log/sys");
    await pause();
    expect(names()).toEqual(["syslog"]);
    expect(text()).toContain("Outside the project");
    await enter();
    expect(openFileViewer).toHaveBeenCalledWith(expect.objectContaining({ absPath: "/var/log/syslog" }));
  });

  it("goes in and up from the list", async () => {
    mocks.projects = [{ root: "/repo", isRemote: true, sshHost: "staging" }];
    await render("/var/log/");
    await pause();
    await openRow("api");
    expect(onQuery).toHaveBeenLastCalledWith("/var/log/api/");
    await openRow("error.log");
    expect(openFileViewer).toHaveBeenCalledWith(
      expect.objectContaining({ absPath: "/var/log/api/error.log", onHost: true }),
    );
    for (const path of ["/var/log/", "/var/", "/"]) {
      await act(async () => latest.folder!.onUp());
      await pause();
      expect(onQuery).toHaveBeenLastCalledWith(path);
    }
    expect(names()).toEqual(["var", "vmlinuz"]);
  });

  it("says it is loading where it opens, rather than showing matches between", async () => {
    await render("/var/log/", true);
    await pause();
    const found = latest.folder!.rows.find((r) => r.name === "api")!;
    await act(async () => latest.folder!.onOpen(found));
    expect(latest.folder?.path).toBe("/var/log/api");
    expect(latest.folder?.note?.text).toBe("Loading…");
  });

  it("leaves a top-level name to the project's matches until it is opened", async () => {
    await render("/bin", true);
    await pause();
    expect(latest.folder).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(text()).toContain("↵ Open");
    await enter();
    expect(onQuery).toHaveBeenLastCalledWith("/bin/");
    await pause();
    expect(names()).toEqual(["..", "sh"]);
    await render("/bin", true);
    await pause();
    expect(latest.folder).toBeNull();
    await render("/bin", false);
    await pause();
    expect(names()).toEqual(["..", "sh"]);
  });

  it("gives way to the tree when it turns out to be the project's", async () => {
    FOLDERS["/"].push({ name: "repo", isDir: true });
    await render("/re");
    await pause();
    expect(names()).toEqual(["repo"]);
    await enter();
    await pause();
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate).toHaveBeenCalledWith({ path: "", isDir: true }, { focusEditor: true });
    onActivate.mockClear();
    await render("/repo/");
    await pause();
    expect(onActivate).not.toHaveBeenCalled();
    FOLDERS["/"].pop();
  });

  it("comes before matches that only hold a top-level name's letters", async () => {
    await render("/bin", true, false);
    await pause();
    expect(names()).toEqual(["..", "sh"]);
    await render("/va", true, false);
    await pause();
    expect(names()).toEqual(["var"]);
  });

  it("is not offered for a name typed in the project", async () => {
    await render("/repo/gone");
    await pause();
    expect(latest.folder).toBeNull();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(latest.headline).toBe("Nothing at “/repo/gone”");
  });

  it("says when nothing in it starts with what is typed", async () => {
    await render("/var/log/zzz");
    await pause();
    expect(latest.folder).toBeNull();
    expect(text()).toBe("");
    expect(latest.headline).toBe("Nothing at “/var/log/zzz”");
  });

  it("says why it can't be read, and when it is empty", async () => {
    mocks.list.mockRejectedValueOnce("Permission denied");
    await render("/var/log");
    await pause();
    expect(latest.folder?.note).toEqual({ text: "Couldn't read this folder: Permission denied", bad: true });
    expect(names()).toEqual([".."]);
    mocks.list.mockResolvedValueOnce([]);
    await render("/var/");
    await pause();
    expect(names()).toEqual([".."]);
    expect(latest.folder?.note?.text).toBe("This folder is empty");
  });
});
