// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  peerTermAttach: vi.fn(() => Promise.resolve()),
  peerTermDetach: vi.fn(() => Promise.resolve()),
  peerUploadFile: vi.fn(),
}));

vi.mock("../../bridge/commands", () => ({
  ResizeTerminal: vi.fn(),
  AckTerminalData: vi.fn(),
  ReadClipboardFiles: vi.fn(),
  SaveClipboardImage: vi.fn(),
  SetClipboardText: vi.fn(),
  IsTerminalRemote: vi.fn(() => Promise.resolve(false)),
  PeerTermAttach: mocks.peerTermAttach,
  PeerTermDetach: mocks.peerTermDetach,
  PeerUploadFile: mocks.peerUploadFile,
  PeerState: vi.fn(() => Promise.resolve(null)),
  UploadAndQuoteForTerminal: vi.fn(),
  UploadClipboardImageForTerminal: vi.fn(),
  UploadFileForTerminal: vi.fn(),
  TerminalPresentControl: vi.fn(() => Promise.resolve(null)),
  TerminalUnpresentControl: vi.fn(() => Promise.resolve(null)),
  TerminalClaimControl: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../bridge/runtime", () => ({
  EventsOn: vi.fn(() => () => {}),
  EventsEmit: vi.fn(),
}));

import {
  attachPeerTerminal,
  disposeInteractivePaneSession,
  interactiveSessions,
  pastePeerUploads,
  repairBlindScreen,
  revivePeerSession,
  writeErrorIsFatal,
} from "./InteractivePane";
import {
  MAX_RETAIN_MS,
  publishPeerSnapshot,
  retainPeerSession,
  reclaimPeerSession,
} from "../peer/retainedSessions";

const SLUG = "a1b2c3d4";
const TERM = `peer-${SLUG}-web-3`;

// The disposal path only needs a session-shaped object: the point under test is
// what it tells the peer client, not xterm teardown.
function fakeSession(id: string, dead: { sessionDead: boolean; exited: boolean } | null = null) {
  const session = {
    term: {
      dispose: vi.fn(),
      paste: vi.fn(),
      write: vi.fn(),
      options: { disableStdin: !!dead, cursorBlink: !dead },
    },
    host: { remove: vi.fn() },
    pathLinkDisposable: null,
    osc52Disposable: null,
    destroy: vi.fn(),
    sessionDead: !!dead?.sessionDead,
    exited: !!dead?.exited,
  };
  interactiveSessions.set(
    id,
    session as unknown as NonNullable<ReturnType<typeof interactiveSessions.get>>,
  );
  return session;
}

afterEach(() => {
  interactiveSessions.clear();
  publishPeerSnapshot([]);
  mocks.peerTermAttach.mockClear();
  mocks.peerTermDetach.mockClear();
  mocks.peerUploadFile.mockReset();
});

describe("disposeInteractivePaneSession", () => {
  it("detaches a peer terminal so the client stops resuming a screen that is gone", () => {
    const session = fakeSession(TERM);
    disposeInteractivePaneSession(TERM);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(session.term.dispose).toHaveBeenCalledTimes(1);
    expect(mocks.peerTermDetach).toHaveBeenCalledWith(TERM);
    expect(interactiveSessions.has(TERM)).toBe(false);
  });

  it("leaves local terminals alone", () => {
    fakeSession("web-3");
    disposeInteractivePaneSession("web-3");
    expect(mocks.peerTermDetach).not.toHaveBeenCalled();
  });

  it("does nothing for a terminal with no session", () => {
    disposeInteractivePaneSession(`peer-${SLUG}-web-9`);
    expect(mocks.peerTermDetach).not.toHaveBeenCalled();
  });
});

describe("attachPeerTerminal", () => {
  // A pane that reuses a cached emulator (the peer-drop retention case) still has
  // the screen the stream left off on, so the host may send only what was missed.
  it("resumes when the emulator that the stream continues is still on screen", () => {
    attachPeerTerminal(TERM, true);
    expect(mocks.peerTermAttach).toHaveBeenCalledWith(TERM, true);
  });

  // A brand-new emulator — first open, or anything after a webview reload, where
  // every session is rebuilt — is blank, so it must not continue from an offset
  // the peer client kept across the reload.
  it("asks for a full reseed when the emulator is new", () => {
    attachPeerTerminal(TERM, false);
    expect(mocks.peerTermAttach).toHaveBeenCalledWith(TERM, false);
  });

  it("never subscribes a local terminal", () => {
    attachPeerTerminal("web-3", false);
    expect(mocks.peerTermAttach).not.toHaveBeenCalled();
  });
});

// Files dropped on (or pasted into) a peer pane exist only on this Mac, so the
// bytes go to the host and what reaches the pty is where the host put them.
describe("pastePeerUploads", () => {
  it("pastes the paths the host saved the files under", async () => {
    const session = fakeSession(TERM);
    mocks.peerUploadFile
      .mockImplementationOnce(() => Promise.resolve("/host/.lpm/uploads/notes.txt"))
      .mockImplementationOnce(() => Promise.resolve("/host/.lpm/uploads/log.txt"));
    await pastePeerUploads(TERM, ["/local/notes.txt", "/local/log.txt"]);
    expect(session.term.paste).toHaveBeenCalledWith(
      "/host/.lpm/uploads/notes.txt /host/.lpm/uploads/log.txt",
    );
    expect(mocks.peerUploadFile).toHaveBeenCalledWith(
      SLUG,
      "web-3",
      "/local/notes.txt",
      expect.any(String),
    );
  });

  it("shell-quotes a host path that isn't one word", async () => {
    const session = fakeSession(TERM);
    mocks.peerUploadFile.mockImplementation(() =>
      Promise.resolve("/host/.lpm/uploads/my notes.txt"),
    );
    await pastePeerUploads(TERM, ["/local/my notes.txt"]);
    expect(session.term.paste).toHaveBeenCalledWith("'/host/.lpm/uploads/my notes.txt'");
  });

  // A lone image still goes in as one bare word so an agent lifts it as an
  // attachment, exactly as a locally dropped one would.
  it("leaves a single image path unquoted", async () => {
    const session = fakeSession(TERM);
    mocks.peerUploadFile.mockImplementation(() => Promise.resolve("/host/.lpm/uploads/shot.png"));
    await pastePeerUploads(TERM, ["/local/shot.png"]);
    expect(session.term.paste).toHaveBeenCalledWith("/host/.lpm/uploads/shot.png");
  });

  it("writes the host's refusal into the pane instead of dropping it", async () => {
    const session = fakeSession(TERM);
    const refusal = "big.zip is 40 MB — update lpm on the other Mac to send files over 8 MB";
    mocks.peerUploadFile.mockImplementation(() => Promise.reject(refusal));
    await pastePeerUploads(TERM, ["/local/big.zip"]);
    expect(session.term.paste).not.toHaveBeenCalled();
    expect(session.term.write).toHaveBeenCalledWith(expect.stringContaining(refusal));
  });
});

// A tab that was in the background when its pane mounted is never measured, so
// the replay it was seeded with was wrapped at xterm's default 80x24 while the
// host's pty kept its real geometry. The fit it finally gets on reveal drives a
// size that pty already has — no SIGWINCH, no repaint — so only a fresh replay
// puts the screen right.
describe("repairBlindScreen", () => {
  function blindSession(id: string) {
    fakeSession(id);
    const session = interactiveSessions.get(id)!;
    session.blindOutput = true;
    return session;
  }

  it("asks for a full replay once a blind peer screen is first measured", () => {
    repairBlindScreen(blindSession(TERM), TERM);
    expect(mocks.peerTermAttach).toHaveBeenCalledWith(TERM, false);
  });

  it("leaves a screen that was drawn at a measured size alone", () => {
    const session = blindSession(TERM);
    session.blindOutput = false;
    repairBlindScreen(session, TERM);
    expect(mocks.peerTermAttach).not.toHaveBeenCalled();
  });

  it("leaves local terminals alone — their pty opens at the blind size", () => {
    repairBlindScreen(blindSession("web-3"), "web-3");
    expect(mocks.peerTermAttach).not.toHaveBeenCalled();
  });
});

// A peer terminal's pty lives on the other machine, so a rejected write means
// the link failed, not the pty. Latching the session dead there survived the
// reconnect that retention exists to serve, leaving the resumed pane read-only.
describe("a failed write vs. a dead pty", () => {
  it("ends a local session, whose pty this Mac owns", () => {
    expect(writeErrorIsFatal("web-3")).toBe(true);
  });

  it("never ends a peer session — only the host's exit frame does", () => {
    expect(writeErrorIsFatal(TERM)).toBe(false);
  });
});

describe("revivePeerSession", () => {
  it("gives a retained session its input back", () => {
    const session = fakeSession(TERM, { sessionDead: true, exited: false });
    revivePeerSession(TERM);
    expect(session.sessionDead).toBe(false);
    expect(session.term.options.disableStdin).toBe(false);
    expect(session.term.options.cursorBlink).toBe(true);
  });

  it("leaves a terminal the host reported gone dead", () => {
    const session = fakeSession(TERM, { sessionDead: true, exited: true });
    revivePeerSession(TERM);
    expect(session.sessionDead).toBe(true);
    expect(session.term.options.disableStdin).toBe(true);
  });

  it("leaves local terminals alone", () => {
    const session = fakeSession("web-3", { sessionDead: true, exited: false });
    revivePeerSession("web-3");
    expect(session.sessionDead).toBe(true);
    expect(session.term.options.disableStdin).toBe(true);
  });

  it("does nothing for a live session", () => {
    const session = fakeSession(TERM);
    revivePeerSession(TERM);
    expect(session.sessionDead).toBe(false);
    expect(session.term.options.disableStdin).toBe(false);
  });
});

describe("bounded peer-session retention", () => {
  // Retention is what keeps a dropped peer's emulator alive to be resumed into;
  // when it finally gives up it has to go through the real disposal, or the peer
  // client keeps re-subscribing an id with nothing to render it (conn.attached
  // grows for the life of the connection).
  it("detaches once retention expires without a pane reclaiming the session", () => {
    vi.useFakeTimers();
    try {
      publishPeerSnapshot([{ slug: SLUG, connected: false }]);
      fakeSession(TERM);
      expect(
        retainPeerSession(TERM, () => disposeInteractivePaneSession(TERM)),
      ).toBe(true);
      vi.advanceTimersByTime(MAX_RETAIN_MS - 1);
      expect(mocks.peerTermDetach).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(mocks.peerTermDetach).toHaveBeenCalledWith(TERM);
      expect(interactiveSessions.has(TERM)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the session subscribed when a pane reclaims it", () => {
    vi.useFakeTimers();
    try {
      publishPeerSnapshot([{ slug: SLUG, connected: false }]);
      fakeSession(TERM);
      retainPeerSession(TERM, () => disposeInteractivePaneSession(TERM));
      reclaimPeerSession(TERM);
      publishPeerSnapshot([{ slug: SLUG, connected: true }]);
      vi.advanceTimersByTime(MAX_RETAIN_MS * 2);
      expect(mocks.peerTermDetach).not.toHaveBeenCalled();
      expect(interactiveSessions.has(TERM)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
