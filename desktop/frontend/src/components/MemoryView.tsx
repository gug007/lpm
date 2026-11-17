import { useCallback, useEffect, useState } from "react";
import { toast } from "../notifications/toast";
import {
  DeleteMemorySession,
  ReadMemorySessions,
  RenameMemorySession,
  WriteMemorySession,
} from "../../bridge/commands";
import { EventsOn } from "../../bridge/runtime";
import { MEMORY_CHANGED_EVENT, type MemorySession } from "../types";
import { useAppStore } from "../store/app";
import { useNow } from "../hooks/useNow";
import { useContentZoom } from "../hooks/useContentZoom";
import { memoryOwner } from "../memoryOwner";
import { MemoryCreateForm } from "./MemoryCreateForm";
import { MemoryEditor } from "./MemoryEditor";
import { MemoryRenameDialog } from "./MemoryRenameDialog";
import { MemorySessionList } from "./MemorySessionList";
import { MessageMarkdown } from "./MessageMarkdown";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { MemoryEmptyState } from "./memory/MemoryEmptyState";
import { MemoryToolbar } from "./memory/MemoryToolbar";

interface MemoryViewProps {
  projectName: string;
  visible: boolean;
  // The pane owns the zoom shortcuts only while it has focus, so ⌘+/⌘− still
  // resize the terminal font from anywhere else.
  focused: boolean;
  // Session another surface (the composer's memory list) asked to show. `seq`
  // rises on every request so picking the same session twice jumps again.
  target?: { name: string; seq: number } | null;
}

const ZOOM_KEY = "lpm.memory-zoom";

type View = { kind: "list" } | { kind: "detail"; name: string } | { kind: "create" };

const slugify = (raw: string) =>
  raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

const SKELETON = (title: string) =>
  `# ${title}\n\n## Goal\n\n\n## Current state\n\n\n## Timeline\n`;

// The session-memory tab (`kind: "memory"`, like the review tab): browses and
// edits the project's shared agent session memory in ~/.lpm/memory/<project>/.
// Agents write the same files, so saves are compare-and-swap and the list
// follows the memory watcher. A duplicate shows its original's memory — the
// backend decides that, so the folder it answers with names the owner.
export function MemoryView({ projectName, visible, focused, target }: MemoryViewProps) {
  const [sessions, setSessions] = useState<MemorySession[]>([]);
  const [dir, setDir] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [baseline, setBaseline] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MemorySession | null>(null);
  const [pendingRename, setPendingRename] = useState<MemorySession | null>(null);
  const zoom = useContentZoom(visible && focused, ZOOM_KEY);
  useNow(visible, 30000);

  const refresh = useCallback(async () => {
    try {
      const state = await ReadMemorySessions(projectName);
      setSessions(state.sessions);
      setDir(state.dir);
    } catch {
      setSessions([]);
    } finally {
      setLoaded(true);
    }
  }, [projectName]);

  // Whoever owns the folder the backend answered with: the project itself, or
  // the original this project is a copy of. Saves are announced under the
  // owner's name, so the watcher needs no knowledge of copies.
  const owner = memoryOwner(projectName, dir);
  const shared = owner !== "" && owner !== projectName;
  const ownerLabel = useAppStore((s) =>
    shared ? s.projects.find((p) => p.name === owner)?.label?.trim() || owner : "",
  );

  useEffect(() => {
    if (visible) void refresh();
  }, [visible, refresh]);

  useEffect(() => {
    if (!visible) return;
    const off = EventsOn(MEMORY_CHANGED_EVENT, (changed: string) => {
      if (changed === projectName || changed === owner) void refresh();
    });
    return () => {
      if (typeof off === "function") off();
    };
  }, [visible, projectName, owner, refresh]);

  useEffect(() => {
    if (!target) return;
    setEditing(false);
    setView({ kind: "detail", name: target.name });
  }, [target]);

  const detail =
    view.kind === "detail" ? sessions.find((s) => s.name === view.name) : undefined;

  const startEdit = (session: MemorySession) => {
    setDraft(session.content);
    setBaseline(session.content);
    setEditing(true);
  };

  const saveEdit = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await WriteMemorySession(projectName, detail.name, draft, baseline);
      setEditing(false);
      await refresh();
    } catch (err) {
      if (String(err).includes("modified")) {
        toast.error("Changed on disk by an agent — reloaded the latest version");
        setEditing(false);
        await refresh();
      } else {
        toast.error(`Save memory: ${String(err)}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const create = async () => {
    const name = slugify(newTitle);
    if (!name) return;
    if (sessions.some((s) => s.name === name)) {
      setView({ kind: "detail", name });
      setNewTitle("");
      return;
    }
    setSaving(true);
    try {
      await WriteMemorySession(projectName, name, SKELETON(newTitle.trim()), undefined);
      await refresh();
      setNewTitle("");
      setView({ kind: "detail", name });
    } catch (err) {
      toast.error(`Create memory: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const backToList = () => {
    setEditing(false);
    setView({ kind: "list" });
  };

  // Renaming the session the pane is showing has to carry the view with it —
  // the old name now names nothing, and the detail would read as removed.
  const confirmRename = async (name: string) => {
    if (!pendingRename) return;
    const from = pendingRename.name;
    setPendingRename(null);
    try {
      await RenameMemorySession(projectName, from, name);
      if (view.kind === "detail" && view.name === from) setView({ kind: "detail", name });
      await refresh();
    } catch (err) {
      toast.error(`Rename memory: ${String(err)}`);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const gone = pendingDelete;
    setPendingDelete(null);
    try {
      await DeleteMemorySession(projectName, gone.name);
      if (view.kind === "detail" && view.name === gone.name) backToList();
      await refresh();
    } catch (err) {
      toast.error(`Delete memory: ${String(err)}`);
    }
  };

  const empty = view.kind === "list" && sessions.length === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--bg-primary)]">
      {!empty && (
        <MemoryToolbar
          view={view.kind}
          count={sessions.length}
          sharedWith={shared ? ownerLabel : ""}
          detail={detail}
          editing={editing}
          zoom={zoom}
          onBack={backToList}
          onCreate={() => setView({ kind: "create" })}
          onRename={setPendingRename}
          onEdit={startEdit}
          onDelete={setPendingDelete}
        />
      )}

      {empty && loaded && (
        <MemoryEmptyState onCreate={() => setView({ kind: "create" })} />
      )}

      {view.kind === "list" && sessions.length > 0 && (
        <MemorySessionList
          sessions={sessions}
          zoom={zoom}
          onOpen={(name) => setView({ kind: "detail", name })}
          onRename={setPendingRename}
          onDelete={setPendingDelete}
        />
      )}

      {view.kind === "detail" && !detail && loaded && (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pb-16 text-sm text-[var(--text-muted)]">
          This session was removed.
        </div>
      )}

      {detail && !editing && (
        <div
          className="min-h-0 flex-1 cursor-text overflow-y-auto"
          onDoubleClick={() => startEdit(detail)}
          ref={zoom.surfaceRef}
        >
          <div className="mx-auto max-w-2xl px-8 py-6" style={{ zoom: zoom.zoom }}>
            <MessageMarkdown text={detail.content} />
          </div>
        </div>
      )}

      {detail && editing && (
        <MemoryEditor
          draft={draft}
          baseline={baseline}
          saving={saving}
          zoom={zoom.zoom}
          onChange={setDraft}
          onCancel={() => setEditing(false)}
          onSave={() => void saveEdit()}
        />
      )}

      {view.kind === "create" && (
        <MemoryCreateForm
          title={newTitle}
          slug={slugify(newTitle)}
          owner={owner || projectName}
          saving={saving}
          onChange={setNewTitle}
          onSubmit={() => void create()}
        />
      )}

      <MemoryRenameDialog
        open={pendingRename !== null}
        currentName={pendingRename?.name ?? ""}
        taken={sessions.map((s) => s.name)}
        onCancel={() => setPendingRename(null)}
        onSubmit={(name) => void confirmRename(name)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete session?"
        body={
          <>
            <span className="font-medium text-[var(--text-primary)]">
              {pendingDelete?.title}
            </span>{" "}
            will be gone for good — agents won't be able to pick this work up
            again.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
