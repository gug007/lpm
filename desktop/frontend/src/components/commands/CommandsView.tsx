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
import { useSkillsUnsaved } from "../../store/skillsUnsaved";
import { useToolkitOpen } from "../../store/toolkitOpen";
import {
  convertSkill,
  createLpmCommandFolder,
  deleteLpmCommandFolder,
  importLpmCommands,
  moveOtherSkill,
  renameLpmCommandFolder,
  saveLpmCommand,
  useLpmCommandLists,
} from "../../store/lpmCommands";
import { copyText, revealInFinder } from "../files/fileActions";
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
import { CommandOtherView } from "./CommandOtherView";
import { CommandsConfirm, type Confirm } from "./CommandsConfirm";
import { CommandsHeader } from "./CommandsHeader";
import { CommandTree } from "./CommandTree";
import {
  type Draft,
  draftAfterFolderMove,
  draftOf,
  findOther,
  isDirty,
  newDraft,
  otherDrop,
  otherKey,
  type OtherPlace,
  type OtherSpot,
  type SkillRowActions,
} from "./commandsModel";
import { canOpenSkillFile, canRevealSkillFile } from "./skillFile";
import { skillOps } from "./skillOps";
import type { SkillMenuActions } from "./skillTreeContext";
import { loadSkillSort, saveSkillSort, type SkillSort } from "./skillUsage";
import { useSkillFiles } from "./useSkillFiles";

interface CommandsViewProps {
  tabId: string;
  projectName: string;
  projectLabel: string;
  visible: boolean;
  // The tab is in view in the focused pane.
  focused: boolean;
}

const NO_PICKS: ReadonlySet<string> = new Set();

// The Skills tab (`kind: "commands"`, like the memory and automations tabs):
// this project's lpm skills and the global ones as one tree of folders,
// with an editor for the one picked. Typing `/name` in an agent's input runs one.
export function CommandsView({ tabId, projectName, projectLabel, visible, focused }: CommandsViewProps) {
  const lists = useLpmCommandLists(projectName, visible);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewing, setViewing] = useState<OtherPlace | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [sort, setSort] = useState<SkillSort>(loadSkillSort);
  const [picked, setPicked] = useState<ReadonlySet<string>>(NO_PICKS);
  const files = useSkillFiles(projectName);
  const pendingDraft = useCommandsOpen((s) => (s.draft?.project === projectName ? s.draft.seq : null));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const dirty = !!draft && !!lists && isDirty(draft, lists);

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

  // Picks of skills that moved or went away let go.
  useEffect(() => {
    if (!lists || picked.size === 0) return;
    const there = new Set(allCommands(lists).map(commandKey));
    if ([...picked].some((key) => !there.has(key))) setPicked(new Set([...picked].filter((key) => there.has(key))));
  }, [lists, picked]);

  useEffect(() => {
    useSkillsUnsaved.getState().set(tabId, dirty);
  }, [tabId, dirty]);
  useEffect(() => () => useSkillsUnsaved.getState().set(tabId, false), [tabId]);

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
  const ops = skillOps({ projectName, lists, draft, setDraft });
  const pickedSkills = () => allCommands(lists).filter((c) => picked.has(commandKey(c)));

  const openSkill = (c: LpmCommand) => {
    setViewing(null);
    setDraft(draftOf(c));
  };

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
    foldersOf: (scope) => scopeList(lists, scope)?.folders ?? [],
  };

  const menu: SkillMenuActions = {
    lists,
    canOpen: (c) => !!c.path && canOpenSkillFile(files.reachOf(c.path, c.scope)),
    canReveal: (c) => !!c.path && canRevealSkillFile(files.reachOf(c.path, c.scope)),
    copyName: (c) => void copyText(`/${c.name}`),
    duplicate: (c) =>
      guard(
        () =>
          void attempt(async () => {
            const made = await ops.duplicate(c);
            if (made) openSkill(made);
          }),
      ),
    move: (cs, to) =>
      void ops.move(cs, to).then((landed) => {
        if (cs.length > 1) setPicked(new Set(landed));
      }),
    copyTo: (cs, scope) => void ops.copyTo(cs, scope),
    keepOut: (cs, keep) => void ops.keepOut(cs, keep),
    reveal: (c) => c.path && void revealInFinder(c.path),
    open: (c) => c.path && files.open(c.path),
    convert: (c) => convert(c.scope, c.name, false),
    remove: (cs) => setConfirm({ kind: "delete", targets: cs.map(commandRef) }),
  };

  // A skill dragged from among the picked ones takes them all along.
  const dragGroup = (c: LpmCommand) => (picked.size > 1 && picked.has(commandKey(c)) ? pickedSkills() : [c]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
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
    const c = active.data.current?.command as LpmCommand | undefined;
    if (c) menu.move(dragGroup(c), key);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-primary)]">
      <CommandsHeader
        hasProject={hasProject}
        onImport={(scope) =>
          void attempt(async () => {
            const n = await importLpmCommands(projectName, scope);
            if (n === 0) toast.info("Nothing new to import.");
            else toast.success(`Imported ${n} ${n === 1 ? "skill" : "skills"}.`);
          })
        }
      />
      <DndContext
        sensors={sensors}
        collisionDetection={innermostTarget}
        onDragStart={({ active }) => {
          const { command, other, folder } = active.data.current ?? {};
          const group = command ? dragGroup(command as LpmCommand).length : 1;
          setDragging(
            folder ? folderLabel(folder.name) : group > 1 ? `${group} skills` : `/${(command ?? other)?.name}`,
          );
        }}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
      >
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
          <CommandTree
            lists={lists}
            projectName={projectName}
            projectLabel={projectLabel}
            query={query}
            selectedKey={
              draft?.original ? commandKey(draft.original) : other && viewing ? otherKey(viewing.scope, other.name) : null
            }
            visible={visible}
            focused={focused}
            sort={sort}
            picked={picked}
            unsavedKey={dirty && draft?.original ? commandKey(draft.original) : null}
            menu={menu}
            onQuery={setQuery}
            onSort={(next) => {
              setSort(next);
              saveSkillSort(next);
            }}
            onPicked={setPicked}
            onSelect={(c) => guard(() => openSkill(c))}
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
              projectName={projectName}
              projectLabel={projectLabel}
              files={files}
              saving={saving}
              onChange={setDraft}
              onSave={() => void save()}
              onDelete={() => draft.original && setConfirm({ kind: "delete", targets: [draft.original] })}
            />
          ) : other && viewing ? (
            <CommandOtherView
              skill={other}
              scope={viewing.scope}
              lists={lists}
              projectLabel={projectLabel}
              files={files}
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
      <CommandsConfirm
        confirm={confirm}
        onCancel={() => setConfirm(null)}
        onConfirm={(c) => {
          setConfirm(null);
          if (c.kind === "discard") c.then();
          else if (c.kind === "delete") {
            setPicked(NO_PICKS);
            void ops.remove(c.targets);
          } else deleteFolder(c.scope, c.name);
        }}
      />
    </div>
  );
}
