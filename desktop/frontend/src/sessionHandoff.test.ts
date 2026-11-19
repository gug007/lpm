import { describe, expect, it } from "vitest";
import type { TerminalInstance } from "./paneTree";
import type { PeerClient } from "./peer/usePeerState";
import { handoffHome, handoffPhaseText, handoffSessionId, handoffTargets } from "./sessionHandoff";

const peer = (over: Partial<PeerClient> = {}): PeerClient => ({
  slug: "abcd1234",
  alias: "Mac Studio",
  host: "studio.local",
  port: 8766,
  enabled: true,
  connected: true,
  supportsHandoff: true,
  supportsGitBring: true,
  ...over,
});

const local = { name: "saas-app", root: "/Users/me/saas-app", isRemote: false };
const remote = { name: "peer-abcd1234-saas-app", root: "/@peer-abcd1234/Users/studio/saas-app", isRemote: false };

describe("handoffTargets", () => {
  it("offers a paired computer that has the same project", () => {
    expect(handoffTargets(local, [local, remote], [peer()])).toEqual([
      { slug: "abcd1234", label: "Mac Studio", project: remote.name, root: "/Users/studio/saas-app" },
    ]);
  });

  it("says why a computer can't take the session", () => {
    const reasonFor = (p: PeerClient, projects = [local, remote]) =>
      handoffTargets(local, projects, [p])[0].reason;
    expect(reasonFor(peer({ connected: false }))).toBe("Offline");
    expect(reasonFor(peer({ supportsHandoff: false }))).toBe("Needs a newer lpm");
    expect(reasonFor(peer(), [local])).toBe("saas-app isn't there");
  });

  it("offers nothing for a paired computer's own project, an SSH project or a turned-off pairing", () => {
    expect(handoffTargets(remote, [local, remote], [peer()])).toEqual([]);
    expect(handoffTargets({ ...local, isRemote: true }, [local, remote], [peer()])).toEqual([]);
    expect(handoffTargets(local, [local, remote], [peer({ enabled: false })])).toEqual([]);
  });

  it("does not match another computer's project of the same name", () => {
    const other = { ...remote, name: "peer-ffff0000-saas-app" };
    expect(handoffTargets(local, [local, other], [peer()])[0].reason).toBe("saas-app isn't there");
  });
});

describe("handoffHome", () => {
  it("takes a paired computer's session into the project of the same name here", () => {
    expect(handoffHome(remote, [local, remote], [peer()])).toMatchObject({
      slug: "abcd1234",
      project: "saas-app",
      root: "/Users/studio/saas-app",
    });
  });

  it("says when the project isn't here, and offers nothing for a local project", () => {
    expect(handoffHome(remote, [remote], [peer()])?.reason).toMatch(/^saas-app isn't on this /);
    expect(handoffHome(local, [local, remote], [peer()])).toBeNull();
  });
});

describe("handoffSessionId", () => {
  const tab = (over: Partial<TerminalInstance>): TerminalInstance =>
    ({ id: "t1", label: "Claude", ...over }) as TerminalInstance;

  it("is the Claude conversation the tab resumes", () => {
    expect(handoffSessionId(tab({ resumeCmd: "claude --resume 1b2c-3d" }))).toBe("1b2c-3d");
  });

  it("is absent for a shell, a Codex tab and a Claude tab with nothing to resume", () => {
    expect(handoffSessionId(tab({}))).toBeNull();
    expect(handoffSessionId(tab({ resumeCmd: "codex resume 1b2c-3d" }))).toBeNull();
    expect(handoffSessionId(tab({ startCmd: "claude" }))).toBeNull();
  });
});

describe("handoffPhaseText", () => {
  it("shows how far a transfer is", () => {
    expect(handoffPhaseText("sending", 512, 2048)).toBe("Sending 25%");
    expect(handoffPhaseText("sending", 0, 0)).toBe("Sending");
    expect(handoffPhaseText("landing", 0, 0)).toBe("Putting the work in place");
  });
});
