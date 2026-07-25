import { useEffect, useRef, useState, type RefObject } from "react";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "../icons";
import { QuestionSettings } from "./ActionQuestionSettings";
import {
  commandSegments,
  inputKeyFromLabel,
  inputProblem,
  insertToken,
  isUnused,
  newInputDraft,
  newOptionDraft,
  removeToken,
  renameToken,
  type InputDraft,
  type InputType,
} from "./actionInputs";

const TYPE_OPTIONS: ReadonlyArray<{
  value: InputType;
  label: string;
  hint: string;
}> = [
  { value: "text", label: "Text", hint: "A box to type anything into." },
  { value: "radio", label: "Choice", hint: "A short list to pick from." },
  { value: "password", label: "Secret", hint: "Hidden, for tokens and passwords." },
];

// The command as it will actually run, with each answer standing in for its
// token. Seeing `{{env}}` become `staging` explains the whole feature without a
// line of help text.
export function CommandPreview({
  cmd,
  inputs,
}: {
  cmd: string;
  inputs: InputDraft[];
}) {
  const segments = commandSegments(cmd, inputs);
  if (!segments.some((segment) => segment.filled)) return null;
  const labelOf = (key: string | undefined) => {
    const input = inputs.find((item) => item.key === key);
    return input ? input.label.trim() || input.key : "";
  };

  // A shell line, not a form field: the same black terminal surface the preview
  // panel's run demo uses. The prompt does the labelling, and answers are
  // distinguished the way a terminal does it — by color, not by chrome.
  return (
    <code className="-mt-4 flex max-h-24 gap-2 overflow-y-auto rounded-md bg-black px-3 py-2 font-mono text-[12px] leading-[1.6] text-white/80 ring-1 ring-inset ring-white/[0.08]">
      <span aria-hidden className="shrink-0 select-none text-white/30">
        $
      </span>
      <span className="min-w-0 break-all">
        {segments.map((segment, index) =>
          segment.filled ? (
            <span
              key={index}
              title={`Answer to “${labelOf(segment.key)}”`}
              className="text-[var(--accent-cyan)]"
            >
              {segment.text}
            </span>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
        <span className="demo-cursor ml-[3px] inline-block h-[11px] w-[6px] translate-y-[2px] bg-white/60" />
      </span>
    </code>
  );
}

export function ActionInputsEditor({
  inputs,
  cmd,
  commandRef,
  onChange,
}: {
  inputs: InputDraft[];
  cmd: string;
  commandRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (next: { cmd?: string; inputs: InputDraft[] }) => void;
}) {
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);

  const replace = (id: string, patch: Partial<InputDraft>) =>
    inputs.map((input) => (input.id === id ? { ...input, ...patch } : input));

  const addInput = () => {
    const key = inputKeyFromLabel(
      "",
      inputs.map((input) => input.key),
    );
    const el = commandRef.current;
    const caret =
      el && document.activeElement === el ? el.selectionStart : null;
    const draft = newInputDraft(key, { autoKey: true });
    onChange({
      cmd: insertToken(cmd, key, caret).cmd,
      inputs: [...inputs, draft],
    });
    setFocusId(draft.id);
  };

  // The key follows the question's name so the token stays readable, and the
  // command is rewritten in step. Keys we picked up from a hand-typed token are
  // left alone — that command text is the user's, not ours.
  const setLabel = (input: InputDraft, label: string) => {
    if (!input.autoKey) {
      onChange({ inputs: replace(input.id, { label }) });
      return;
    }
    const key = inputKeyFromLabel(
      label,
      inputs.filter((i) => i.id !== input.id).map((i) => i.key),
    );
    onChange({
      cmd: key === input.key ? undefined : renameToken(cmd, input.key, key),
      inputs: replace(input.id, { label, key }),
    });
  };

  const setType = (input: InputDraft, type: InputType) => {
    const patch: Partial<InputDraft> = { type };
    if (type === "radio") {
      if (input.options.length === 0) {
        patch.options = [newOptionDraft(), newOptionDraft()];
      }
      const values = (patch.options ?? input.options).map((o) => o.value.trim());
      if (input.default && !values.includes(input.default)) patch.default = "";
      // A choice question is useless until it has choices, so open the settings
      // rather than leaving the user staring at an unchanged row.
      setOpenIds((prev) =>
        prev.includes(input.id) ? prev : [...prev, input.id],
      );
    }
    onChange({ inputs: replace(input.id, patch) });
  };

  const removeInput = (input: InputDraft) =>
    onChange({
      cmd: removeToken(cmd, input.key),
      inputs: inputs.filter((i) => i.id !== input.id),
    });

  const addToCommand = (input: InputDraft) =>
    onChange({
      cmd: insertToken(cmd, input.key, null).cmd,
      inputs,
    });

  return (
    <div className="space-y-2.5">
      <div className="text-[12px] font-medium text-[var(--text-secondary)]">
        Before running, ask
      </div>

      {inputs.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          Ask a question before running — like which environment to deploy to.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border)]/60">
          {inputs.map((input) => (
            <QuestionRow
              key={input.id}
              input={input}
              unused={isUnused(input, cmd)}
              open={openIds.includes(input.id)}
              autoFocus={focusId === input.id}
              onFocused={() => setFocusId(null)}
              onToggle={() =>
                setOpenIds((prev) =>
                  prev.includes(input.id)
                    ? prev.filter((id) => id !== input.id)
                    : [...prev, input.id],
                )
              }
              onLabel={(label) => setLabel(input, label)}
              onType={(type) => setType(input, type)}
              onPatch={(patch) => onChange({ inputs: replace(input.id, patch) })}
              onRemove={() => removeInput(input)}
              onAddToCommand={() => addToCommand(input)}
            />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={addInput}
        className="-mx-1 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
      >
        <PlusIcon /> Ask for a value
      </button>
    </div>
  );
}

function QuestionRow({
  input,
  unused,
  open,
  autoFocus,
  onFocused,
  onToggle,
  onLabel,
  onType,
  onPatch,
  onRemove,
  onAddToCommand,
}: {
  input: InputDraft;
  unused: boolean;
  open: boolean;
  autoFocus: boolean;
  onFocused: () => void;
  onToggle: () => void;
  onLabel: (label: string) => void;
  onType: (type: InputType) => void;
  onPatch: (patch: Partial<InputDraft>) => void;
  onRemove: () => void;
  onAddToCommand: () => void;
}) {
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    labelRef.current?.focus();
    onFocused();
  }, [autoFocus, onFocused]);

  const problem = inputProblem(input);

  return (
    <div className="group -mx-1 rounded-lg px-1 transition-colors hover:bg-[var(--bg-hover)]/40">
      <div className="flex items-center gap-1.5 py-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide settings" : "Show settings"}
          className={`shrink-0 rounded p-1 text-[var(--text-muted)] transition-transform hover:text-[var(--text-primary)] ${open ? "rotate-90" : ""}`}
        >
          <ChevronRightIcon />
        </button>
        <input
          ref={labelRef}
          value={input.label}
          onChange={(e) => onLabel(e.target.value)}
          placeholder="What to ask for"
          className="min-w-0 flex-1 bg-transparent py-1 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
        <code
          title="Replaced with the answer when the command runs"
          className="shrink-0 font-mono text-[11px] text-[var(--text-muted)] opacity-70"
        >
          {`{{${input.key}}}`}
        </code>
        <TypeMenu value={input.type} onChange={onType} />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove question"
          className="shrink-0 rounded p-1 text-[var(--text-muted)] opacity-0 transition-opacity hover:text-[var(--text-primary)] focus-visible:opacity-100 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      </div>

      {unused && (
        <div className="flex items-center gap-2 pb-1.5 pl-7 text-[11px] text-[var(--accent-amber)]">
          <span>Not in the command</span>
          <button
            type="button"
            onClick={onAddToCommand}
            className="font-medium underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Add it
          </button>
        </div>
      )}
      {!open && problem && (
        <div className="pb-1.5 pl-7 text-[11px] text-[var(--accent-red)]">
          {problem}
        </div>
      )}
      {open && (
        <div className="pb-2 pl-7 pr-1">
          <QuestionSettings input={input} problem={problem} onPatch={onPatch} />
        </div>
      )}
    </div>
  );
}

// One quiet control instead of three visible segments: the current type reads
// as a word, the alternatives (with what they do) live in the menu.
function TypeMenu({
  value,
  onChange,
}: {
  value: InputType;
  onChange: (type: InputType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), open);
  const current = TYPE_OPTIONS.find((option) => option.value === value);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Answer type"
        className={`flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] transition-colors ${
          open
            ? "text-[var(--text-primary)]"
            : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        }`}
      >
        {current?.label}
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1 shadow-xl">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setOpen(false);
                if (option.value !== value) onChange(option.value);
              }}
              className="flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span
                className={`text-[12px] ${option.value === value ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`}
              >
                {option.label}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {option.hint}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
