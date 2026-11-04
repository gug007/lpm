import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { promptVariables, scopeList, shadowNote, type LpmCommandLists } from "../../lpmCommands";
import { FIELD_CLASS } from "../ui/fields";
import {
  commandPath,
  draftProblem,
  folderKey,
  isDirty,
  parseFolderKey,
  scopeTitle,
  scopesOf,
  type Draft,
} from "./commandsModel";

interface CommandEditorProps {
  draft: Draft;
  lists: LpmCommandLists;
  projectLabel: string;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
}

const LABEL = "text-[11.5px] font-medium text-[var(--text-muted)]";
const TOKEN = "rounded px-1 font-mono text-[11px]";

// The right column of the Commands tab: one command's name, folder, the line
// the `/` menu shows beside it, and its prompt. ⌘S or Save writes the file.
export function CommandEditor({ draft, lists, projectLabel, saving, onChange, onSave, onDelete }: CommandEditorProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = draft.original === null;
  const problem = draftProblem(draft, lists);
  const dirty = isDirty(draft, lists);
  const canSave = dirty && !problem && !saving;
  const { asks, auto } = promptVariables(draft.body);
  const shadow = draft.name ? shadowNote(draft, lists) : null;

  useEffect(() => {
    if (isNew) nameRef.current?.focus();
  }, [isNew]);

  const set = (patch: Partial<Draft>) => onChange({ ...draft, ...patch });

  return (
    <form
      className="flex min-h-0 min-w-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) onSave();
      }}
      onKeyDown={(e) => {
        if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          e.stopPropagation();
          if (canSave) onSave();
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-4 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={LABEL}>Name</span>
            <span className={`${FIELD_CLASS} flex items-center px-2.5 focus-within:border-[var(--accent-cyan)]`}>
              <span className="font-mono text-[var(--accent-cyan)]">/</span>
              <input
                ref={nameRef}
                id="lpm-command-name"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value.replace(/\s+/g, "-") })}
                placeholder="fix-ticket"
                spellCheck={false}
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[var(--accent-cyan)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </span>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className={LABEL}>Folder</span>
            <select
              id="lpm-command-folder"
              value={folderKey(draft.scope, draft.folder)}
              onChange={(e) => {
                const place = parseFolderKey(e.target.value);
                if (place) set(place);
              }}
              className={`${FIELD_CLASS} px-2 py-1.5`}
            >
              {scopesOf(lists).map((scope) => (
                <optgroup key={scope} label={scopeTitle(scope, projectLabel)}>
                  {scopeList(lists, scope)!.folders.map((f) => (
                    <option key={f} value={folderKey(scope, f)}>
                      {f}
                    </option>
                  ))}
                  <option value={folderKey(scope, null)}>No folder</option>
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        {shadow && <p className="-mt-1.5 text-[11.5px] text-[var(--accent-amber-text)]">{shadow}</p>}
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Description</span>
          <input
            id="lpm-command-description"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Shown next to the name in the / menu"
            className={`${FIELD_CLASS} px-2.5 py-1.5`}
          />
        </label>
        <label className="flex min-h-[180px] flex-1 flex-col gap-1.5">
          <span className={LABEL}>Prompt</span>
          <textarea
            id="lpm-command-body"
            value={draft.body}
            onChange={(e) => set({ body: e.target.value })}
            placeholder="Review my uncommitted changes for bugs and list blocking issues first."
            className={`${FIELD_CLASS} min-h-[140px] flex-1 resize-none px-2.5 py-2 leading-relaxed`}
          />
        </label>
        <p className="text-[11.5px] leading-relaxed text-[var(--text-muted)]">
          {asks.length + auto.length > 0 ? (
            <>
              {asks.length > 0 && (
                <>
                  Asks for{" "}
                  {asks.map((v) => (
                    <span key={v} className={`${TOKEN} mr-1 bg-[var(--accent-cyan)]/12 text-[var(--accent-cyan)]`}>
                      {v}
                    </span>
                  ))}
                  from the words after <span className="font-mono">/{draft.name || "name"}</span>, in order.{" "}
                </>
              )}
              {auto.length > 0 && (
                <>
                  Fills in{" "}
                  {auto.map((v) => (
                    <span key={v} className={`${TOKEN} mr-1 bg-[var(--accent-green)]/12 text-[var(--accent-green-text)]`}>
                      {v}
                    </span>
                  ))}
                  by itself.
                </>
              )}
            </>
          ) : (
            <>
              Add <span className="font-mono">{"{{ticket}}"}</span> to ask for a value when it runs;{" "}
              <span className="font-mono">{"{{branch}}"}</span>, <span className="font-mono">{"{{project}}"}</span> and{" "}
              <span className="font-mono">{"{{dir}}"}</span>, the command's folder, fill themselves in.
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--text-muted)]" title={commandPath(draft)}>
          {dirty && problem ? <span className="font-sans text-[var(--accent-amber-text)]">{problem}</span> : commandPath(draft)}
        </span>
        {!isNew && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete command"
            aria-label="Delete command"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red-text)]"
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-md bg-[var(--accent-cyan)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--bg-primary)] transition-opacity hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
