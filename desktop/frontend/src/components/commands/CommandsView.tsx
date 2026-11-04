import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SquareSlash } from "lucide-react";
import { toast } from "../../notifications/toast";
import {
  allCommands,
  commandKey,
  commandRef,
  sameCommand,
  scopeList,
  type CommandScope,
  type LpmCommand,
} from "../../lpmCommands";
import { useCommandsOpen } from "../../store/commandsOpen";
import {
  createLpmCommandFolder,
  deleteLpmCommand,
  deleteLpmCommandFolder,
  importLpmCommands,
  renameLpmCommandFolder,
  saveLpmCommand,
  useLpmCommandLists,
} from "../../store/lpmCommands";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyState } from "../ui/EmptyState";
import { CommandEditor } from "./CommandEditor";
import { CommandImportButton } from "./CommandImportButton";
import { CommandTree } from "./CommandTree";
import {
  draftOf,
  isDirty,
  movedTo,
  newDraft,
  type Draft,
  type FolderKey,
} from "./commandsModel";

interface CommandsViewProps {
  projectName: string;
  projectLabel: string;
  visible: boolean;
}

type Confirm =
  | { kind: "discard"; then: () => void }
  | { kind: "delete" }
  | { kind: "folder"; scope: CommandScope; name: string; count: number };

// The Skills tab (`kind: "commands"`, like the memory and automations tabs):
// this project's lpm skills and the global ones as one tree of folders,
// with an editor for the one picked. Typing `/name` in an agent's input runs one.
export function CommandsView({ projectName, projectLabel, visible }: CommandsViewProps) {
  const lists = useLpmCommandLists(projectName, visible);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [dragging, setDragging] = useState<LpmCommand | null>(null);
  const pendingDraft = useCommandsOpen((s) => (s.draft?.project === projectName ? s.draft.seq : null));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Save as skill, from an input: a new skill holding that prompt, beside
  // the one open.
  useEffect(() => {
    if (pendingDraft === null || !lists) return;
    const body = useCommandsOpen.getState().takeDraft(projectName);
    if (body !== null) setDraft((open) => newDraft(open, lists, body));
  }, [pendingDraft, lists, projectName]);

  // An untouched editor follows its file when the list is read again (a phone
  // or another window changed it), and closes once the file is gone.
  useEffect(() => {
    if (!lists || !draft?.original || isDirty(draft, lists)) return;
    const saved = allCommands(lists).find((c) => sameCommand(c, draft.original));
    if (!saved) setDraft(null);
  }, [lists, draft]);

  const guard = useCallback(
    (next: () => void) => {
      if (draft && lists && isDirty(draft, lists)) setConfirm({ kind: "discard", then: next });
      else next();
    },
    [draft, lists],
  );

  const attempt = async (op: () => Promise<unknown>) => {
    try {
      await op();
      return true;
    } catch (err) {
      toast.error(String(err));
      return false;
    }
  };

  if (!lists) {
    return <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">Loading…</div>;
  }

  const hasProject = lists.project !== null;
  const empty = allCommands(lists).length === 0;

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const { original, ...input } = draft;
    await attempt(async () => {
      const next = await saveLpmCommand(projectName, input, original);
      const saved = allCommands(next).find((c) => sameCommand(c, input));
      setDraft(saved ? draftOf(saved) : null);
    });
    setSaving(false);
  };

  const removeCommand = async () => {
    if (!draft?.original) return;
    const target = draft.original;
    if (await attempt(() => deleteLpmCommand(projectName, target))) setDraft(null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const c = active.data.current?.command as LpmCommand | undefined;
    const key = over?.data.current?.folderKey as FolderKey | undefined;
    if (!c || !key) return;
    const moved = movedTo(c, key, lists);
    if (!moved) return;
    const editing = sameCommand(draft?.original ?? null, c) && draft && !isDirty(draft, lists);
    void attempt(async () => {
      await saveLpmCommand(projectName, moved, commandRef(c));
      if (editing) setDraft({ ...moved, original: commandRef(moved) });
    });
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-4 py-2.5">
        <SquareSlash size={15} className="text-[var(--accent-cyan)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">Skills</p>
          <p className="truncate text-[11.5px] text-[var(--text-muted)]">
            Type <span className="font-mono text-[var(--accent-cyan)]">/name</span> in an agent's input to run one.
          </p>
        </div>
        <CommandImportButton
          hasProject={hasProject}
          onImport={(scope) =>
            void attempt(async () => {
              const n = await importLpmCommands(projectName, scope);
              if (n === 0) toast.info("Nothing new to import.");
              else toast.success(`Imported ${n} ${n === 1 ? "skill" : "skills"}.`);
            })
          }
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={({ active }) => setDragging((active.data.current?.command as LpmCommand | undefined) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
          <CommandTree
            lists={lists}
            projectLabel={projectLabel}
            query={query}
            selectedKey={draft?.original ? commandKey(draft.original) : null}
            onQuery={setQuery}
            onSelect={(c) => guard(() => setDraft(draftOf(c)))}
            onNew={(where) => guard(() => setDraft(newDraft(where ?? draft, lists)))}
            onCreateFolder={(scope, name) => void attempt(() => createLpmCommandFolder(projectName, scope, name))}
            onRenameFolder={(scope, name, newName) =>
              void attempt(async () => {
                await renameLpmCommandFolder(projectName, scope, name, newName);
                if (draft?.scope === scope && draft.folder === name) {
                  setDraft({
                    ...draft,
                    folder: newName,
                    original: draft.original && { ...draft.original, folder: newName },
                  });
                }
              })
            }
            onDeleteFolder={(scope, name) =>
              setConfirm({
                kind: "folder",
                scope,
                name,
                count: scopeList(lists, scope)?.commands.filter((c) => c.folder === name).length ?? 0,
              })
            }
          />
          {draft ? (
            <CommandEditor
              key={draft.original ? commandKey(draft.original) : "new"}
              draft={draft}
              lists={lists}
              projectLabel={projectLabel}
              saving={saving}
              onChange={setDraft}
              onSave={() => void save()}
              onDelete={() => setConfirm({ kind: "delete" })}
            />
          ) : (
            <div className="flex min-h-0 items-start justify-center overflow-y-auto">
              <EmptyState
                icon={<SquareSlash size={20} />}
                title={empty ? "Save the prompts you send most" : "Pick a skill"}
                body={
                  empty
                    ? "A skill is a prompt you run by typing /name in an agent's input, and every agent can use it. This project's skills travel with it in git; global ones work everywhere."
                    : "Or press New. Drag a skill onto a folder to move it."
                }
              />
            </div>
          )}
        </div>
        <DragOverlay dropAnimation={null}>
          {dragging && (
            <span className="inline-flex rounded-md border border-[var(--accent-cyan)]/50 bg-[var(--bg-secondary)] px-2.5 py-1 font-mono text-[12.5px] text-[var(--accent-cyan)] shadow-lg">
              /{dragging.name}
            </span>
          )}
        </DragOverlay>
      </DndContext>
      <ConfirmDialog
        open={confirm !== null}
        title={
          confirm?.kind === "discard"
            ? "Discard your changes?"
            : confirm?.kind === "folder"
              ? `Delete the ${confirm.name} folder?`
              : `Delete /${draft?.original?.name ?? ""}?`
        }
        body={
          confirm?.kind === "discard"
            ? "The skill you're editing has changes that aren't saved."
            : confirm?.kind === "folder"
              ? confirm.count > 0
                ? `Its ${confirm.count === 1 ? "skill moves" : `${confirm.count} skills move`} to the top level.`
                : "It's empty."
              : "Its file is deleted."
        }
        confirmLabel={confirm?.kind === "discard" ? "Discard" : "Delete"}
        variant="destructive"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (c?.kind === "discard") c.then();
          else if (c?.kind === "delete") void removeCommand();
          else if (c?.kind === "folder")
            void attempt(() => deleteLpmCommandFolder(projectName, c.scope, c.name));
        }}
      />
    </div>
  );
}
