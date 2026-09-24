import { describe, expect, it } from "vitest";
import {
  discardRelaunchNotices,
  queueRelaunchNotice,
  relaunchNoticeFor,
  relaunchNoticeLine,
  relaunchNoticePlacer,
  splitAfterScreenClear,
  takeRelaunchNotice,
} from "./relaunchNotices";

const ID = "peer-a1b2c3d4-app-9";

describe("relaunch notices", () => {
  // Taking is the once-only guarantee: whichever pane builds the screen gets the
  // note, and a remount or a second pane over the same terminal gets nothing.
  it("hands a queued notice out exactly once", () => {
    queueRelaunchNotice(ID, "note");
    expect(takeRelaunchNotice(ID)).toBe("note");
    expect(takeRelaunchNotice(ID)).toBeUndefined();
  });

  it("drops notices nobody took", () => {
    queueRelaunchNotice(ID, "note");
    queueRelaunchNotice("peer-a1b2c3d4-app-10", "other");
    discardRelaunchNotices([ID]);
    expect(takeRelaunchNotice(ID)).toBeUndefined();
    expect(takeRelaunchNotice("peer-a1b2c3d4-app-10")).toBe("other");
  });

  it("says what the new terminal is about to do, in the order restore picks it", () => {
    expect(relaunchNoticeFor({ resumeCmd: "claude --resume a", startCmd: "claude" })).toMatch(
      /resuming it\]$/,
    );
    expect(relaunchNoticeFor({ startCmd: "npm run dev" })).toMatch(/starting it again\]$/);
    expect(relaunchNoticeFor({})).toMatch(/this is a new shell\]$/);
  });
});

describe("splitAfterScreenClear", () => {
  // A new screen's first chunk is the host's replay behind a full clear; a note
  // written ahead of the clear would be erased with the scrollback.
  it("splits a replay just after its clear", () => {
    const reset = "\x1b[?1049l\x1b[0m\x1b[2J\x1b[3J\x1b[H";
    expect(splitAfterScreenClear(`${reset}user@host:~$ `)).toEqual([reset, "user@host:~$ "]);
  });

  it("puts a chunk with no clear entirely after the note", () => {
    expect(splitAfterScreenClear("plain output")).toEqual(["", "plain output"]);
  });
});

describe("relaunchNoticePlacer", () => {
  const CLEAR = "\x1b[2J\x1b[3J\x1b[H";
  const RESET = `\x1b[?1049l\x1b[0m${CLEAR}`;
  const LINE = relaunchNoticeLine("note");

  // The pane's buffer after each chunk: a clear takes screen and scrollback.
  function screenAfter(chunks: Array<[string, boolean]>): string {
    const place = relaunchNoticePlacer("note");
    let screen = "";
    for (const [chunk, sized] of chunks) {
      const placed = place(chunk, sized);
      screen += placed ? placed.before + placed.notice + placed.after : chunk;
      const at = screen.lastIndexOf(CLEAR);
      if (at !== -1) screen = screen.slice(at + CLEAR.length);
    }
    return screen;
  }

  const count = (screen: string) => screen.split(LINE).length - 1;

  it("lands once on a pane that was sized before its replay arrived", () => {
    const screen = screenAfter([
      [`${RESET}$ `, true],
      ["claude\r\n", true],
    ]);
    expect(screen).toBe(`${LINE}$ claude\r\n`);
  });

  // A tab restored while hidden gets its replay unsized, then the whole replay again
  // when it is first shown; the note has to survive that second clear.
  it("survives the full replay a blind pane gets when it is first sized", () => {
    const screen = screenAfter([
      [`${RESET}$ `, false],
      ["claude\r\n", false],
      [`${RESET}$ claude\r\n`, true],
      ["output", true],
    ]);
    expect(count(screen)).toBe(1);
    expect(screen.startsWith(LINE)).toBe(true);
  });

  it("never stacks the note ahead of live output on a screen it is already on", () => {
    const screen = screenAfter([
      [`${RESET}$ `, false],
      ["live", false],
      ["more", false],
    ]);
    expect(screen).toBe(`${LINE}$ livemore`);
  });

  it("is done once it has been written onto a sized screen", () => {
    const place = relaunchNoticePlacer("note");
    expect(place(`${RESET}$ `, true)).not.toBeNull();
    expect(place(`${RESET}$ `, true)).toBeNull();
  });

  it("places nothing for a pane with no note", () => {
    expect(relaunchNoticePlacer(undefined)(`${RESET}$ `, false)).toBeNull();
  });
});
