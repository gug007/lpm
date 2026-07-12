import { NotesReadFileAsInput, PeerSend } from "../bridge/commands";
import { EventsOn } from "../bridge/runtime";
import { nextReqId, peerRequest } from "./store/peerRequest";
import { basename } from "./path";
import type { PeerFrame } from "./store/peers";
import type { SlashCommand } from "./slashCommands";
import type { MentionItem } from "./mentions";
import type { ComposerAction } from "./store/composerActions";

const REQUEST_TIMEOUT = 10000;
const UPLOAD_TIMEOUT = 30000;
const TRANSFORM_TIMEOUT = 90000;

// The remote composer's data layer: the peer Mac computes slash commands,
// @-mention targets, and AI rewrites against ITS project/cwd (the local bridge
// would compute meaningless local answers), and file attachments are transferred
// to the peer so the on-Mac path an agent loads is valid there. Everything here
// speaks the same messages the iOS client uses; the desktop peer relay is
// transparent, so no Rust changes are needed.
export interface RemoteComposerSource {
  peerId: string;
  project: string;
  terminalId: string;
  // The peer's slash-command autocomplete for this terminal (empty unless it runs
  // a known AI CLI — the peer detects that from the terminal's launch command).
  listSlashCommands(): Promise<SlashCommand[]>;
  // The peer project's files/dirs, git changes flagged, as "@" mention targets.
  listMentions(): Promise<MentionItem[]>;
  // The peer's enabled composer AI actions.
  listActions(): Promise<ComposerAction[]>;
  // Run an AI rewrite on the peer, `variants` in parallel; resolves the non-empty
  // results in arrival order once the peer signals the batch is done.
  transform(instruction: string, text: string, variants: number): Promise<string[]>;
  // Transfer a locally-saved attachment's bytes to the peer, returning the path it
  // was written to on the peer (what gets pasted into the peer terminal).
  uploadLocalPath(localPath: string): Promise<string>;
  // File the composer text as an unsent draft in the peer's shared history.
  saveDraft(text: string, images: Record<string, string>): Promise<void>;
}

export function makeRemoteComposerSource(
  peerId: string,
  project: string,
  terminalId: string,
): RemoteComposerSource {
  return {
    peerId,
    project,
    terminalId,

    async listSlashCommands(): Promise<SlashCommand[]> {
      const r = await peerRequest(
        peerId,
        { t: "slash", id: terminalId, project },
        (f) => f.t === "slash" && f.id === terminalId,
        REQUEST_TIMEOUT,
      ).catch(() => null);
      const cmds = (r as PeerFrame | null)?.commands as SlashCommand[] | undefined;
      return Array.isArray(cmds) ? cmds : [];
    },

    async listMentions(): Promise<MentionItem[]> {
      const r = await peerRequest(
        peerId,
        { t: "mentions", project },
        (f) => f.t === "mentions" && f.project === project,
        REQUEST_TIMEOUT,
      ).catch(() => null);
      const entries =
        ((r as PeerFrame | null)?.entries as { path: string; dir?: boolean; changed?: boolean }[]) ?? [];
      return entries.map((e) => ({
        kind: e.changed ? "changed" : e.dir ? "dir" : "file",
        label: e.path,
        insert: e.path,
      }));
    },

    async listActions(): Promise<ComposerAction[]> {
      const r = await peerRequest(
        peerId,
        { t: "composerActions" },
        (f) => f.t === "composerActions",
        REQUEST_TIMEOUT,
      ).catch(() => null);
      const list =
        ((r as PeerFrame | null)?.actions as {
          id?: string;
          icon?: string;
          label?: string;
          instruction?: string;
        }[]) ?? [];
      return list.map((a, i) => ({
        id: a.id || `remote-${i}`,
        icon: a.icon || "sparkles",
        label: a.label ?? "",
        instruction: a.instruction ?? "",
        enabled: true,
      }));
    },

    transform(instruction: string, text: string, variants: number): Promise<string[]> {
      return remoteTransform(peerId, project, instruction, text, variants);
    },

    async uploadLocalPath(localPath: string): Promise<string> {
      const input = (await NotesReadFileAsInput(localPath)) as { mimeType?: string; data: string };
      const reqId = nextReqId();
      const r = (await peerRequest(
        peerId,
        {
          t: "upload",
          id: terminalId,
          data: input.data,
          mime: input.mimeType || "image/png",
          name: basename(localPath),
          reqId,
        },
        (f) => f.t === "upload" && (f as PeerFrame).reqId === reqId,
        UPLOAD_TIMEOUT,
      )) as PeerFrame;
      if (r.ok === false || typeof r.path !== "string") {
        throw new Error((r.error as string) || "Couldn't attach the file on the other Mac.");
      }
      return r.path;
    },

    async saveDraft(text: string, images: Record<string, string>): Promise<void> {
      await peerRequest(
        peerId,
        { t: "historySaveDraft", message: text, project, id: terminalId, images },
        (f) => f.t === "historySaveDraft",
        REQUEST_TIMEOUT,
      );
    },
  };
}

// The peer streams one `transform` frame per variant (arrival-ordered, possibly
// interleaved) then a `transformDone`. peerRequest resolves on the first match, so
// collect the stream directly off the peer-frame event, correlating by reqId.
function remoteTransform(
  peerId: string,
  project: string,
  instruction: string,
  text: string,
  variants: number,
): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const reqId = nextReqId();
    const results: string[] = [];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error("The other Mac didn't respond in time."));
    }, TRANSFORM_TIMEOUT);
    const off = EventsOn("peer-frame", (m: { peerId: string; frame: PeerFrame }) => {
      if (!m || !m.frame || m.peerId !== peerId) return;
      const f = m.frame;
      if (f.reqId !== reqId) return;
      if (f.t === "transform") {
        if (f.ok !== false && typeof f.text === "string") {
          const t = f.text.trim();
          if (t) results.push(t);
        }
      } else if (f.t === "transformDone") {
        finish();
        resolve(results);
      }
    });
    void PeerSend(peerId, { t: "transform", reqId, project, instruction, text, variants }).catch(() => {
      finish();
      reject(new Error("Couldn't reach this Mac."));
    });
  });
}
