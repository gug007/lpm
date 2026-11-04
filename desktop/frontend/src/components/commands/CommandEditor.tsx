import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { allCommands, commandKey, promptVariables, sameCommand, shadowNote, type LpmCommandLists } from "../../lpmCommands";
import { isMac } from "../../platform";
import { FIELD_CLASS } from "../ui/fields";
import { CommandFieldIssue } from "./CommandFieldIssue";
import { CommandGitSwitch } from "./CommandGitSwitch";
import { CommandPlaceSelect } from "./CommandPlaceSelect";
import { canKeepOutOfGit, commandPath, draftFile, draftIssue, isDirty, keptOutNote, type Draft } from "./commandsModel";
import type { SkillFiles } from "./skillFile";
import { SkillPathButton } from "./SkillPathButton";
import { SkillPromptEditor } from "./SkillPromptEditor";

interface CommandEditorProps {
  draft: Draft;
  lists: LpmCommandLists;
  projectLabel: string;
  files: SkillFiles;
  saving: boolean;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onDelete: () => void;
}

const LABEL = "text-[11.5px] font-medium text-[var(--text-muted)]";
const TOKEN = "rounded px-1 font-mono text-[11px]";
const SAVE_KEYS = isMac ? "⌘S" : "Ctrl+S";

const insideMonaco = (target: EventTarget | null) =>
  target instanceof Element && target.closest(".monaco-editor") !== null;

// The right column of the Skills tab: one skill's name, folder, the line the
// `/` menu shows beside it, and its prompt. ⌘S or Save writes the file.
export function CommandEditor({ draft, lists, projectLabel, files, saving, onChange, onSave, onDelete }: CommandEditorProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const isNew = draft.original === null;
  const saved = draft.original ? allCommands(lists).find((c) => sameCommand(c, draft.original)) : null;
  const issue = draftIssue(draft, lists);
  const dirty = isDirty(draft, lists);
  const canSave = dirty && !issue && !saving;
  // A problem shows once there's something to save, by the field it's about.
  const shown = dirty ? issue : null;
  const nameIssue = shown?.field === "name" ? shown : null;
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
        // The prompt editor saves through its own ⌘S.
        if (e.key === "s" && (e.metaKey || e.ctrlKey) && !insideMonaco(e.target)) {
          e.preventDefault();
          e.stopPropagation();
          if (canSave) onSave();
        }
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-4 pb-4 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor="lpm-command-name" className={LABEL}>
              Name
            </label>
            <span
              className={`${FIELD_CLASS} flex items-center px-2.5 ${
                nameIssue ? "!border-[var(--accent-amber)]" : "focus-within:border-[var(--accent-cyan)]"
              }`}
            >
              <span className="font-mono text-[var(--accent-cyan)]">/</span>
              <input
                ref={nameRef}
                id="lpm-command-name"
                value={draft.name}
                onChange={(e) => set({ name: e.target.value.replace(/\s+/g, "-") })}
                placeholder="fix-ticket"
                spellCheck={false}
                autoComplete="off"
                aria-invalid={nameIssue ? true : undefined}
                aria-describedby={nameIssue ? "lpm-command-name-issue" : undefined}
                className="min-w-0 flex-1 bg-transparent py-1.5 font-mono text-[var(--accent-cyan)] outline-none placeholder:text-[var(--text-muted)]"
              />
            </span>
            {nameIssue && (
              <CommandFieldIssue
                id="lpm-command-name-issue"
                issue={nameIssue}
                onFix={(name) => {
                  set({ name });
                  nameRef.current?.focus();
                }}
              />
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span id="lpm-command-folder-label" className={LABEL}>
              Folder
            </span>
            <CommandPlaceSelect
              id="lpm-command-folder"
              labelledBy="lpm-command-folder-label"
              place={draft}
              lists={lists}
              projectLabel={projectLabel}
              onChange={set}
            />
          </div>
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
        {canKeepOutOfGit(draft, lists) && (
          <CommandGitSwitch
            checked={draft.keepOutOfGit}
            note={keptOutNote(draft, lists)}
            onChange={(keepOutOfGit) => set({ keepOutOfGit })}
          />
        )}
        <SkillPromptEditor
          value={draft.body}
          modelKey={draft.original ? commandKey(draft.original) : "new"}
          invalid={shown?.field === "body"}
          onChange={(body) => set({ body })}
          onSave={() => canSave && onSave()}
        />
        {shown?.field === "body" && <CommandFieldIssue id="lpm-command-body-issue" issue={shown} />}
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
              <span className="font-mono">{"{{dir}}"}</span>, the skill's folder, fill themselves in.
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-[var(--border)] px-4 py-2.5">
        <SkillPathButton label={commandPath(draft, saved)} path={draftFile(draft, saved)} scope={draft.scope} files={files} />
        {dirty && <span className="shrink-0 text-[11px] text-[var(--text-muted)]">Unsaved</span>}
        {!isNew && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete skill"
            aria-label="Delete skill"
            className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red-text)]"
          >
            <Trash2 size={14} />
          </button>
        )}
        <button
          type="submit"
          disabled={!canSave}
          title={`Save (${SAVE_KEYS})`}
          className="flex items-center gap-1.5 rounded-md bg-[var(--accent-cyan)] px-3.5 py-1.5 text-[12px] font-semibold text-[var(--bg-primary)] transition-opacity hover:brightness-110 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
          {!saving && <kbd className="font-sans text-[10.5px] font-medium opacity-70">{SAVE_KEYS}</kbd>}
        </button>
      </div>
    </form>
  );
}
