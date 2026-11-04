import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Folder, FolderGit2, FolderLock, FolderMinus, FolderPlus, Globe } from "lucide-react";
import type { CommandScope, LpmCommandLists } from "../../lpmCommands";
import { useAnchoredPanel } from "../../hooks/useAnchoredPanel";
import { FIELD_CLASS } from "../ui/fields";
import { folderDepth, folderKey, folderLabel, folderNamed } from "./commandFolders";
import { CommandFolderInput } from "./CommandFolderInput";
import { placeChoices, scopeTitle, type CommandPlace } from "./commandsModel";

interface CommandPlaceSelectProps {
  id: string;
  labelledBy: string;
  place: CommandPlace;
  lists: LpmCommandLists;
  projectLabel: string;
  // Keeps the choices to one list, for a skill that can't leave it.
  onlyScope?: CommandScope;
  // Adds the Other skills group as a place, for a skill not made in lpm.
  otherGroup?: { current: boolean; onChoose: () => void };
  onChange: (place: CommandPlace) => void;
}

type Row = { key: string; scope: CommandScope; label: string } & (
  | { kind: "place"; folder: string | null; depth: number }
  | { kind: "new" }
  | { kind: "group" }
);

const NO_FOLDER = "No folder";
const OTHER_GROUP = "Other skills";
const MIN_PANEL_WIDTH = 260;
const ROW_INDENT = 10;
const INDENT_STEP = 14;

function rowsOf(place: CommandPlace, lists: LpmCommandLists, onlyScope?: CommandScope, group = false): Row[] {
  const choices = placeChoices(place, lists).filter((c) => !onlyScope || c.scope === onlyScope);
  return choices.flatMap(({ scope, folders }) => [
    ...folders.map(
      (folder): Row => ({
        kind: "place",
        key: folderKey(scope, folder),
        scope,
        folder,
        depth: folder ? folderDepth(folder) : 0,
        label: folder ? folderLabel(folder) : NO_FOLDER,
      }),
    ),
    ...(group ? [{ kind: "group", key: `group:${scope}`, scope, label: OTHER_GROUP } as Row] : []),
    { kind: "new", key: `new:${scope}`, scope, label: "New folder" },
  ]);
}

// Where a skill is kept: which list and which folder in it. The field names
// both, because the same "No folder" exists in each list and they aren't the
// same place; a folder can be started here without leaving the editor.
export function CommandPlaceSelect({
  id,
  labelledBy,
  place,
  lists,
  projectLabel,
  onlyScope,
  otherGroup,
  onChange,
}: CommandPlaceSelectProps) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState<CommandScope | null>(null);
  const [width, setWidth] = useState(MIN_PANEL_WIDTH);
  const hasGroup = !!otherGroup;
  const rows = useMemo(() => rowsOf(place, lists, onlyScope, hasGroup), [place, lists, onlyScope, hasGroup]);
  const inGroup = !!otherGroup?.current;
  const selected = rows.findIndex((r) =>
    inGroup ? r.kind === "group" : r.key === folderKey(place.scope, place.folder),
  );
  const [highlighted, setHighlighted] = useState(selected);
  const twoLists = lists.project !== null && !onlyScope;

  const close = () => {
    setOpen(false);
    setAdding(null);
  };

  const { triggerRef, panelRef, style } = useAnchoredPanel<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose: close,
    width,
    align: "left",
    flip: true,
  });

  useEffect(() => {
    if (!open || !style) return;
    panelRef.current?.querySelector(`[data-index="${highlighted}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [open, style, highlighted, panelRef]);

  // Measured with the open itself, so the panel's first frame has its width.
  const show = () => {
    setWidth(Math.max(MIN_PANEL_WIDTH, triggerRef.current?.getBoundingClientRect().width ?? 0));
    setHighlighted(selected);
    setOpen(true);
  };

  const choose = (row: Row) => {
    if (row.kind === "new") {
      setAdding(row.scope);
      return;
    }
    if (row.kind === "group") otherGroup?.onChoose();
    else onChange({ scope: row.scope, folder: row.folder });
    close();
  };

  const finishAdding = (scope: CommandScope, name: string | null) => {
    setAdding(null);
    triggerRef.current?.focus();
    if (name === null) return;
    onChange({ scope, folder: folderNamed(name, scope, lists) || null });
    setOpen(false);
  };

  const jumpTo = (char: string) => {
    const c = char.toLowerCase();
    for (let step = 1; step <= rows.length; step++) {
      const i = (highlighted + step) % rows.length;
      if (rows[i].label.toLowerCase().startsWith(c)) {
        setHighlighted(i);
        return;
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    if (e.key === "Tab") {
      close();
      return;
    }
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlighted(rows.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(rows[highlighted]);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      jumpTo(e.key);
    }
  };

  const renderRow = (row: Row, index: number) => {
    if (row.kind === "new" && adding === row.scope) {
      return (
        <div key={row.key} className="px-1 py-0.5">
          <CommandFolderInput
            placeholder="Name, or Parent/Name"
            onDone={(name) => finishAdding(row.scope, name)}
          />
        </div>
      );
    }
    const isNew = row.kind === "new";
    const place = row.kind === "place" ? row : null;
    const Icon = isNew ? FolderPlus : row.kind === "group" ? FolderLock : place?.folder ? Folder : FolderMinus;
    return (
      <button
        key={row.key}
        type="button"
        role="option"
        aria-selected={index === selected}
        data-index={index}
        title={place?.folder ?? row.label}
        style={place?.depth ? { paddingLeft: ROW_INDENT + place.depth * INDENT_STEP } : undefined}
        // Focus stays on the field, which is what reads the arrow keys.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => choose(row)}
        onMouseEnter={() => setHighlighted(index)}
        className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100 ${
          index === highlighted ? "bg-[var(--bg-hover)] text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
        }`}
      >
        <Icon size={13} className="shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 flex-1 truncate">{row.label}</span>
        {index === selected && <Check size={13} className="shrink-0 text-[var(--accent-cyan)]" />}
      </button>
    );
  };

  const scopes: CommandScope[] = [...new Set(rows.map((r) => r.scope))];

  const panel =
    open &&
    style &&
    createPortal(
      <div
        ref={panelRef}
        style={style}
        role="listbox"
        aria-labelledby={labelledBy}
        className="z-[70] max-h-80 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-2xl"
      >
        {scopes.map((scope, s) => (
          <div
            key={scope}
            role="group"
            aria-label={scopeTitle(scope, projectLabel)}
            className={s > 0 ? "mt-1 border-t border-[var(--border)] pt-1" : undefined}
          >
            <div className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-[var(--text-muted)]">
              {scope === "project" ? <FolderGit2 size={12} /> : <Globe size={12} />}
              <span className="min-w-0 truncate">{scopeTitle(scope, projectLabel)}</span>
            </div>
            {rows.map((row, i) => (row.scope === scope ? renderRow(row, i) : null))}
          </div>
        ))}
      </div>,
      document.body,
    );

  const TriggerIcon = inGroup ? FolderLock : place.folder === null ? FolderMinus : Folder;
  const placeName = inGroup ? OTHER_GROUP : (place.folder ?? NO_FOLDER);
  const listName = place.scope === "project" ? "This project" : "Global";

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy}
        title={`${placeName} · ${listName}`}
        onClick={() => (open ? close() : show())}
        onKeyDown={handleKeyDown}
        className={`${FIELD_CLASS} flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors duration-150 hover:border-[var(--text-muted)] ${
          open ? "border-[var(--accent-cyan)] hover:border-[var(--accent-cyan)]" : ""
        }`}
      >
        <TriggerIcon size={13} className="shrink-0 text-[var(--text-muted)]" />
        <span className="min-w-0 grow truncate">{placeName}</span>
        {twoLists && (
          // Gives way first: in a narrow pane the folder is the part to keep.
          <span className="min-w-0 shrink-[1000] truncate text-[11.5px] text-[var(--text-muted)]">
            {listName}
          </span>
        )}
        <ChevronDown
          size={13}
          className={`shrink-0 text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {panel}
    </>
  );
}
