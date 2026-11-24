import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ asks: [] as { root: string; paths: string[]; answer: (found: boolean[]) => void }[] }));
vi.mock("../../../bridge/commands", () => ({
  FilesExist: vi.fn(
    (root: string, paths: string[]) =>
      new Promise((answer) => {
        host.asks.push({ root, paths: [...paths], answer });
      }),
  ),
}));

import { forgetFileIndexes, hostFilesExist } from "./fileIndex";

const turn = () => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  forgetFileIndexes();
  host.asks.length = 0;
});

describe("asking an SSH host which paths are files", () => {
  it("asks it one thing at a time, the rest together", async () => {
    const first = hostFilesExist("~/api", ["/a"]);
    await turn();
    const second = hostFilesExist("~/api", ["/b", "/c"]);
    const third = hostFilesExist("~/api", ["/c", "/d"]);
    await turn();
    expect(host.asks.map((ask) => ask.paths)).toEqual([["/a"]]);

    host.asks[0].answer([true]);
    expect(await first).toEqual([true]);
    await turn();
    expect(host.asks.map((ask) => ask.paths)).toEqual([["/a"], ["/b", "/c", "/d"]]);
    host.asks[1].answer([false, true, false]);
    expect(await second).toEqual([false, true]);
    expect(await third).toEqual([true, false]);
  });

  it("doesn't hold one host's ask for another's", async () => {
    void hostFilesExist("~/api", ["/a"]);
    void hostFilesExist("~/web", ["/a"]);
    await turn();
    expect(host.asks.map((ask) => ask.root)).toEqual(["~/api", "~/web"]);
    host.asks.forEach((ask) => ask.answer([true]));
  });

  it("goes on after an ask that failed", async () => {
    const first = hostFilesExist("~/down", ["/a"]);
    await turn();
    host.asks[0].answer(Promise.reject(new Error("no host")) as never);
    expect(await first).toEqual([false]);
    const second = hostFilesExist("~/down", ["/b"]);
    await turn();
    host.asks[1].answer([true]);
    expect(await second).toEqual([true]);
  });
});
