import { useCallback, useEffect, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
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
  type CommandScope,
  type LpmCommand,
  type OtherSkill,
  sameCommand,
  scopeList,
} from "../../lpmCommands";
import { useCommandsOpen } from "../../store/commandsOpen";
import { useToolkitOpen } from "../../store/toolkitOpen";
import {
  convertSkill,
  createLpmCommandFolder,
  deleteLpmCommand,
  deleteLpmCommandFolder,
  importLpmCommands,
  moveOtherSkill,
  renameLpmCommandFolder,
  saveLpmCommand,
  useLpmCommandLists,
} from "../../store/lpmCommands";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { EmptyState } from "../ui/EmptyState";
import {
  type DraggedFolder,
  folderDrop,
  folderLabel,
  folderParent,
  type FolderKey,
  heldCount,
  innermostTarget,
  parseFolderKey,
} from "./commandFolders";
import { CommandEditor } from "./CommandEditor";
import { CommandImportButton } from "./CommandImportButton";
import { CommandOtherView } from "./CommandOtherView";
import { CommandTree } from "./CommandTree";
import {
  type Draft,
  draftAfterFolderMove,
  draftOf,
  findOther,
  isDirty,
  movedTo,
  newDraft,
  otherDrop,
  otherKey,
  type OtherPlace,
  type OtherSpot,
  type SkillRowActions,
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
  const [viewing, setViewing] = useState<OtherPlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const pendingDraft = useCommandsOpen((s) => (s.draft?.project === projectName ? s.draft.seq : null));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Save as skill, from an input: a new skill holding that prompt, beside
  // the one open.
  useEffect(() => {
    if (pendingDraft === null || !lists) return;
    const body = useCommandsOpen.getState().takeDraft(projectName);
    if (body === null) return;
    setViewing(null);
    setDraft((open) => newDraft(open, lists, body));
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
  const other = viewing ? findOther(lists, viewing) : null;
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

  const moveOther = (scope: CommandScope, name: string, spot: OtherSpot) => {
    void attempt(() => moveOtherSkill(projectName, scope, name, spot.folder, spot.root));
  };

  const dropOther = (skill: OtherSkill, scope: CommandScope, key: FolderKey, intoGroup: boolean) => {
    const spot = otherDrop(skill, scope, key, intoGroup);
    const crossing = parseFolderKey(key)?.scope !== scope;
    if (!spot) {
      if (crossing) toast.info("This skill stays in its own list.");
      return;
    }
    moveOther(scope, skill.name, spot);
    if (crossing) {
      toast.info(`Moved to ${spot.folder} in ${scope === "project" ? "This project" : "Global"}, its own list.`);
    }
  };

  const renameFolder = (scope: CommandScope, name: string, newName: string) =>
    void attempt(async () => {
      await renameLpmCommandFolder(projectName, scope, name, newName);
      setDraft((d) => d && draftAfterFolderMove(d, scope, name, newName));
    });

  const deleteFolder = (scope: CommandScope, name: string) =>
    void attempt(async () => {
      await deleteLpmCommandFolder(projectName, scope, name);
      setDraft((d) => d && draftAfterFolderMove(d, scope, name, folderParent(name)));
    });

  const dropFolder = (folder: DraggedFolder, key: FolderKey) => {
    const to = folderDrop(folder, key);
    if (to) renameFolder(folder.scope, folder.name, to);
    else if (parseFolderKey(key)?.scope !== folder.scope) toast.info("A folder stays in its own list.");
  };

  const convert = (scope: CommandScope, name: string, toLpm: boolean) =>
    guard(() =>
      void attempt(async () => {
        const next = await convertSkill(projectName, scope, name, toLpm);
        const made = toLpm ? scopeList(next, scope)?.commands.find((c) => c.name === name) : null;
        setViewing(toLpm ? null : { scope, name });
        setDraft(made ? draftOf(made) : null);
      }),
    );

  const actions: SkillRowActions = {
    onSelectOther: (scope, skill) =>
      guard(() => {
        setDraft(null);
        setViewing({ scope, name: skill.name });
      }),
    onConvert: convert,
    onOpenInAgentSetup: (skill) => useToolkitOpen.getState().request(projectName, skill.path),
    onMoveOther: moveOther,
    foldersOf: (scope) => (lists ? (scopeList(lists, scope)?.folders ?? []) : []),
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    const c = active.data.current?.command as LpmCommand | undefined;
    const key = over?.data.current?.folderKey as FolderKey | undefined;
    if (!key) return;
    const folder = active.data.current?.folder as DraggedFolder | undefined;
    if (folder) {
      if (!over?.data.current?.otherGroup) dropFolder(folder, key);
      return;
    }
    const other = active.data.current?.other as OtherSkill | undefined;
    if (other) {
      dropOther(other, active.data.current?.scope as CommandScope, key, !!over?.data.current?.otherGroup);
      return;
    }
    if (!c) return;
    const moved = movedTo(c, key, lists);
    if (!moved) return;
    const editing = sameCommand(draft?.original ?? null, c) && draft && !isDirty(draft, lists);
    void attempt(async () => {
      await saveLpmCommand(projectName, moved, commandRef(c));
      if (editing) {
        const keepOutOfGit = moved.scope === c.scope && !!c.keptOutOfGit;
        setDraft({ ...moved, keepOutOfGit, original: commandRef(moved) });
      }
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
        collisionDetection={innermostTarget}
        onDragStart={({ active }) => {
          const { command, other, folder } = active.data.current ?? {};
          setDragging(folder ? folderLabel(folder.name) : `/${(command ?? other)?.name}`);
        }}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
          <CommandTree
            lists={lists}
            projectLabel={projectLabel}
            query={query}
            selectedKey={
              draft?.original ? commandKey(draft.original) : other && viewing ? otherKey(viewing.scope, other.name) : null
            }
            onQuery={setQuery}
            onSelect={(c) =>
              guard(() => {
                setViewing(null);
                setDraft(draftOf(c));
              })
            }
            actions={actions}
            onNew={(where) =>
              guard(() => {
                setViewing(null);
                setDraft(newDraft(where ?? draft, lists));
              })
            }
            onCreateFolder={(scope, name) => void attempt(() => createLpmCommandFolder(projectName, scope, name))}
            onRenameFolder={renameFolder}
            onDeleteFolder={(scope, name) => {
              const list = scopeList(lists, scope);
              setConfirm({ kind: "folder", scope, name, count: list ? heldCount(list, name) : 0 });
            }}
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
          ) : other && viewing ? (
            <CommandOtherView
              skill={other}
              scope={viewing.scope}
              lists={lists}
              projectLabel={projectLabel}
              onMove={(spot) => moveOther(viewing.scope, other.name, spot)}
              onConvert={() => convert(viewing.scope, other.name, true)}
              onOpenInAgentSetup={() => actions.onOpenInAgentSetup(other)}
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
              {dragging}
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
              ? `Delete the ${folderLabel(confirm.name)} folder?`
              : `Delete /${draft?.original?.name ?? ""}?`
        }
        body={
          confirm?.kind === "discard"
            ? "The skill you're editing has changes that aren't saved."
            : confirm?.kind === "folder"
              ? confirm.count > 0
                ? "What's inside moves up a level."
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
          else if (c?.kind === "folder") deleteFolder(c.scope, c.name);
        }}
      />
    </div>
  );
}
