import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal } from "./ui/Modal";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { Switch } from "./ui/Switch";
import { AICLIMenu } from "./ui/AICLIMenu";
import { FIELD_CLASS } from "./ui/fields";
import { ChevronDownIcon, PencilIcon, PlusIcon, TrashIcon, XIcon } from "./icons";
import { useAIPicker, type AIPicker } from "../hooks/useAIPicker";
import { useOutsideClick } from "../hooks/useOutsideClick";
import {
  COMPOSER_ACTION_ICONS,
  DEFAULT_COMPOSER_ACTIONS,
  composerActionIcon,
  createComposerAction,
  saveComposerActions,
  useComposerActions,
  type ComposerAction,
} from "../store/composerActions";

interface ComposerActionsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ComposerActionsModal({ open, onClose }: ComposerActionsModalProps) {
  const actions = useComposerActions();
  const ai = useAIPicker(open);
  // null = list view; otherwise the action draft being added/edited.
  const [draft, setDraft] = useState<ComposerAction | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setIsNew(false);
      setConfirmReset(false);
    }
  }, [open]);

  useEffect(() => {
    if (draft) setTimeout(() => labelRef.current?.focus(), 60);
  }, [draft]);

  const persist = (list: ComposerAction[]) => void saveComposerActions(list);

  const toggle = (id: string) =>
    persist(actions.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));

  const remove = (id: string) => persist(actions.filter((a) => a.id !== id));

  const resetToDefaults = () => {
    persist(DEFAULT_COMPOSER_ACTIONS.map((a) => ({ ...a })));
    setConfirmReset(false);
  };

  const startNew = () => {
    setDraft(createComposerAction());
    setIsNew(true);
  };

  const startEdit = (action: ComposerAction) => {
    setDraft({ ...action });
    setIsNew(false);
  };

  const saveDraft = () => {
    if (!draft || !draft.instruction.trim()) return;
    const clean: ComposerAction = {
      ...draft,
      label: draft.label.trim() || "Untitled action",
      instruction: draft.instruction.trim(),
    };
    persist(isNew ? [...actions, clean] : actions.map((a) => (a.id === clean.id ? clean : a)));
    setDraft(null);
    setIsNew(false);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        backdropClassName="bg-black/60 backdrop-blur-sm"
        contentClassName="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-2xl"
        zIndexClassName="z-[60]"
      >
        <div className="flex max-h-[80vh] w-[min(560px,calc(100vw-32px))] flex-col">
          {draft ? (
            <ActionEditor
              draft={draft}
              isNew={isNew}
              labelRef={labelRef}
              onChange={setDraft}
              onCancel={() => {
                setDraft(null);
                setIsNew(false);
              }}
              onSave={saveDraft}
            />
          ) : (
            <ActionList
              actions={actions}
              ai={ai}
              onToggle={toggle}
              onEdit={startEdit}
              onRemove={remove}
              onNew={startNew}
              onReset={() => setConfirmReset(true)}
              onClose={onClose}
            />
          )}
        </div>
      </Modal>
      <ConfirmDialog
        open={confirmReset}
        title="Reset composer actions"
        confirmLabel="Reset"
        variant="destructive"
        body={
          <>
            This replaces your current actions with the built-in defaults (all disabled). Any custom
            actions you added will be removed. This can't be undone.
          </>
        }
        onCancel={() => setConfirmReset(false)}
        onConfirm={resetToDefaults}
      />
    </>
  );
}

interface ActionListProps {
  actions: ComposerAction[];
  ai: AIPicker;
  onToggle: (id: string) => void;
  onEdit: (action: ComposerAction) => void;
  onRemove: (id: string) => void;
  onNew: () => void;
  onReset: () => void;
  onClose: () => void;
}

function ActionList({ actions, ai, onToggle, onEdit, onRemove, onNew, onReset, onClose }: ActionListProps) {
  return (
    <>
      <header className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
            Composer actions
          </h2>
          <p className="mt-1 text-[12.5px] leading-5 text-[var(--text-muted)]">
            One-tap AI rewrites for your input. Enable the ones you want — they appear in the composer.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1.5 -mt-1 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-1">
        {actions.length === 0 ? (
          <div className="py-10 text-center text-[12.5px] text-[var(--text-muted)]">
            No actions yet. Create one to get started.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5 pb-1">
            {actions.map((action) => {
              const Icon = composerActionIcon(action.icon);
              return (
                <li
                  key={action.id}
                  className={`group flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/50 px-3 py-2.5 transition-colors ${
                    action.enabled ? "" : "opacity-70"
                  }`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-active)] text-[var(--text-secondary)]">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-[var(--text-primary)]">
                      {action.label || "Untitled action"}
                    </div>
                    <div className="truncate text-[11.5px] text-[var(--text-muted)]">
                      {action.instruction || "No instruction"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => onEdit(action)}
                      aria-label="Edit action"
                      title="Edit"
                      className="rounded-md p-1.5 text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100 [&>svg]:h-3.5 [&>svg]:w-3.5"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(action.id)}
                      aria-label="Delete action"
                      title="Delete"
                      className="rounded-md p-1.5 text-[var(--text-muted)] opacity-0 transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent-red)] group-hover:opacity-100 [&>svg]:h-3.5 [&>svg]:w-3.5"
                    >
                      <TrashIcon />
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={action.enabled}
                      aria-label={action.enabled ? "Disable action" : "Enable action"}
                      onClick={() => onToggle(action.id)}
                      className="ml-1 flex items-center rounded-full outline-none"
                    >
                      <Switch checked={action.enabled} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between gap-2 px-6 pb-5 pt-3">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md px-2 py-1 text-[12px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          Reset to defaults
        </button>
        <div className="flex items-center gap-2">
          {ai.anyAvailable && <CliPicker ai={ai} />}
          <button
            type="button"
            onClick={onNew}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--text-primary)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--bg-primary)] transition-opacity hover:opacity-90 [&>svg]:h-3.5 [&>svg]:w-3.5"
          >
            <PlusIcon />
            New action
          </button>
        </div>
      </footer>
    </>
  );
}

// Picks the AI CLI/model the actions run with — the same global selection used
// by commit/PR generation, surfaced here so it's visible and changeable where
// actions are configured.
function CliPicker({ ai }: { ai: AIPicker }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="AI used to run actions"
        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3 [&>svg]:w-3"
      >
        <Sparkles size={13} strokeWidth={1.75} />
        {ai.cliLabel}
        <ChevronDownIcon />
      </button>
      {open && (
        <AICLIMenu
          aiCLIs={ai.aiCLIs}
          selectedCLI={ai.selectedCLI}
          selectedModel={ai.selectedModel}
          selectedEffort={ai.selectedEffort}
          selectedFast={ai.selectedFast}
          placement="up"
          onSelect={(cli, model) => {
            ai.selectAI(cli, model);
            setOpen(false);
          }}
          onSelectEffort={ai.selectEffort}
          onSelectFast={ai.selectFast}
        />
      )}
    </div>
  );
}

interface ActionEditorProps {
  draft: ComposerAction;
  isNew: boolean;
  labelRef: React.RefObject<HTMLInputElement | null>;
  onChange: (draft: ComposerAction) => void;
  onCancel: () => void;
  onSave: () => void;
}

function ActionEditor({ draft, isNew, labelRef, onChange, onCancel, onSave }: ActionEditorProps) {
  const canSave = draft.instruction.trim().length > 0;
  return (
    <>
      <header className="flex items-center justify-between gap-4 px-6 pb-4 pt-5">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-primary)]">
          {isNew ? "New action" : "Edit action"}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="-mr-1.5 -mt-0.5 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <XIcon />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Icon</span>
          <div className="flex flex-wrap gap-1.5">
            {COMPOSER_ACTION_ICONS.map(({ name, Icon }) => {
              const selected = draft.icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange({ ...draft, icon: name })}
                  aria-label={`Icon ${name}`}
                  aria-pressed={selected}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                    selected
                      ? "border-[var(--accent-cyan)] bg-[var(--accent-cyan)]/10 text-[var(--accent-cyan)]"
                      : "border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]/40 hover:text-[var(--text-primary)]"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">Name</span>
          <input
            ref={labelRef}
            value={draft.label}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
            placeholder="e.g. Improve prompt"
            spellCheck={false}
            className={`${FIELD_CLASS} px-3 py-2`}
          />
          <p className="text-[11.5px] text-[var(--text-muted)]">Shown as the tooltip in the composer.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--text-secondary)]">AI instruction</span>
          <textarea
            value={draft.instruction}
            onChange={(e) => onChange({ ...draft, instruction: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSave();
              }
            }}
            placeholder="Describe how to transform the text, e.g. “Rewrite this to be clearer and more concise.”"
            rows={5}
            spellCheck={false}
            className={`${FIELD_CLASS} resize-none px-3 py-2 leading-relaxed`}
          />
          <p className="text-[11.5px] text-[var(--text-muted)]">
            The composer's current text is appended to this instruction.
          </p>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 px-6 pb-5 pt-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="rounded-lg bg-[var(--text-primary)] px-4 py-1.5 text-[12.5px] font-medium text-[var(--bg-primary)] transition-all hover:opacity-90 disabled:opacity-30"
        >
          {isNew ? "Add action" : "Save"}
        </button>
      </footer>
    </>
  );
}
