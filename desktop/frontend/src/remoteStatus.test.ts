import { describe, expect, it } from "vitest";
import {
  REMOTE_TONE_STYLE,
  commandFailure,
  mergeCommandState,
  mergeRefreshedState,
  remoteStatus,
  type RemoteStatusInput,
} from "./remoteStatus";

function remote(over: Partial<RemoteStatusInput> = {}): RemoteStatusInput {
  return {
    enabled: true,
    running: true,
    bindError: null,
    host: "192.168.1.20",
    port: 8765,
    ...over,
  };
}

describe("remoteStatus", () => {
  it("invites the user to turn it on when it is off", () => {
    expect(remoteStatus(remote({ enabled: false, running: false }))).toEqual({
      tone: "off",
      label: "Off — turn on to let a paired phone connect",
      address: null,
      problem: null,
    });
  });

  it("shows where a phone connects while it is live", () => {
    expect(remoteStatus(remote())).toEqual({
      tone: "live",
      label: "Live",
      address: "192.168.1.20:8765",
      problem: null,
    });
  });

  it("names just the port until this Mac has an address", () => {
    expect(remoteStatus(remote({ host: null })).address).toBe("port 8765");
  });

  it("waits while it is still coming up", () => {
    const status = remoteStatus(remote({ running: false }));
    expect(status.tone).toBe("starting");
    expect(status.label).toBe("Starting…");
    expect(status.problem).toBeNull();
  });

  it("stops waiting once the Mac reports it could not start", () => {
    const status = remoteStatus(
      remote({ running: false, bindError: "Port 8765 is already in use." }),
    );
    expect(status.tone).toBe("problem");
    expect(status.label).toBe("Can't start");
    expect(status.problem).toBe("Port 8765 is already in use.");
  });

  it("treats a blank report as nothing to report", () => {
    expect(remoteStatus(remote({ running: false, bindError: "   " })).tone).toBe("starting");
    expect(remoteStatus(remote({ running: false, bindError: undefined })).tone).toBe("starting");
  });

  it("forgets an earlier problem once it is running again", () => {
    const status = remoteStatus(remote({ bindError: "Port 8765 is already in use." }));
    expect(status.tone).toBe("live");
    expect(status.problem).toBeNull();
  });

  it("keeps a problem quiet while remote control is turned off", () => {
    const status = remoteStatus(
      remote({ enabled: false, running: false, bindError: "Port 8765 is already in use." }),
    );
    expect(status.tone).toBe("off");
    expect(status.problem).toBeNull();
  });
});

describe("mergeCommandState", () => {
  interface State {
    enabled: boolean;
    port: number;
    running: boolean;
    bindError: string | null;
    devices: string[];
  }

  const live: State = {
    enabled: true,
    port: 8765,
    running: true,
    bindError: null,
    devices: ["phone"],
  };

  it("keeps the Mac's report when a command answers with an older picture", () => {
    const answer = { ...live, running: false, devices: [] };
    const merged = mergeCommandState(live, answer);
    expect(merged.running).toBe(true);
    expect(merged.bindError).toBeNull();
    expect(remoteStatus(remote(merged)).tone).toBe("live");
  });

  it("takes every other field from the command's answer", () => {
    const answer = { ...live, port: 8790, devices: ["phone", "ipad"], running: false };
    expect(mergeCommandState(live, answer)).toEqual({
      enabled: true,
      port: 8790,
      running: true,
      bindError: null,
      devices: ["phone", "ipad"],
    });
  });

  it("never lets a command's answer resurrect a problem the Mac has moved past", () => {
    const stale = { ...live, running: false, bindError: "Port 8765 is already in use." };
    expect(mergeCommandState(live, stale).bindError).toBeNull();
  });

  it("keeps a problem the Mac reported while the command was in flight", () => {
    const reported = { ...live, running: false, bindError: "Port 8765 is already in use." };
    const merged = mergeCommandState(reported, { ...live, port: 8790 });
    expect(merged.port).toBe(8790);
    expect(merged.running).toBe(false);
    expect(merged.bindError).toBe("Port 8765 is already in use.");
  });
});

describe("mergeRefreshedState", () => {
  interface State {
    port: number;
    running: boolean;
    bindError: string | null;
  }

  const read: State = { port: 8790, running: false, bindError: null };

  it("takes the whole re-read when the Mac said nothing while it was in flight", () => {
    const live: State = { port: 8765, running: true, bindError: null };
    expect(mergeRefreshedState(live, read, false)).toEqual(read);
  });

  it("keeps a report that landed during the read, so it isn't undone", () => {
    const reported: State = { port: 8765, running: true, bindError: null };
    expect(mergeRefreshedState(reported, read, true)).toEqual({
      port: 8790,
      running: true,
      bindError: null,
    });
  });

  it("keeps a failure reported during the read", () => {
    const reported: State = { port: 8765, running: false, bindError: "Port 8765 is in use." };
    const merged = mergeRefreshedState(reported, { ...read, running: true }, true);
    expect(merged.running).toBe(false);
    expect(merged.bindError).toBe("Port 8765 is in use.");
    expect(remoteStatus(remote(merged)).tone).toBe("problem");
  });
});

describe("commandFailure", () => {
  it("keeps the message beside the control the user just used", () => {
    expect(commandFailure("server", "", null).slot).toBe("server");
    expect(commandFailure("tailscale", "", null).slot).toBe("network");
    expect(commandFailure("pair", "", null).slot).toBe("devices");
    expect(commandFailure("revoke", "", null).slot).toBe("devices");
  });

  it("says what did not happen", () => {
    expect(commandFailure("server", "", null).message).toBe("That change wasn't saved.");
    expect(commandFailure("pair", "", null).message).toBe("Couldn't start pairing.");
    expect(commandFailure("revoke", "", null).message).toBe("That device wasn't revoked.");
  });

  it("reads a rejection that is a plain sentence, not an error object", () => {
    const failure = commandFailure("server", "the mobile settings were not saved", null);
    expect(failure.message).toBe("That change wasn't saved. The mobile settings were not saved.");
  });

  it("leaves a reason that already reads as a sentence alone", () => {
    expect(commandFailure("revoke", new Error("Permission denied."), null).message).toBe(
      "That device wasn't revoked. Permission denied.",
    );
  });

  it("drops a rejection that says nothing a person can read", () => {
    for (const err of [undefined, null, "", "   ", {}]) {
      expect(commandFailure("pair", err, null).message).toBe("Couldn't start pairing.");
    }
  });

  it("does not repeat the reason the pane is already explaining at the top", () => {
    const failure = commandFailure(
      "server",
      "the mobile settings file at /Users/me/.lpm/remote.json is damaged",
      "lpm can't read its saved mobile settings, so pairing is paused.",
    );
    expect(failure.message).toBe("That change wasn't saved.");
  });
});

describe("REMOTE_TONE_STYLE", () => {
  it("styles every status from theme tokens, so light and dark both work", () => {
    for (const style of Object.values(REMOTE_TONE_STYLE)) {
      for (const value of Object.values(style)) {
        expect(value).toContain("var(--");
        expect(value).not.toMatch(/#[0-9a-f]{3}/i);
      }
    }
  });
});
