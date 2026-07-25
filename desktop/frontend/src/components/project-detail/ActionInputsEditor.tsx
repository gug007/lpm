import { useEffect, useRef, useState, type RefObject } from "react";
import { SegmentedControl } from "../ui/SegmentedControl";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "../icons";
import { QuestionSettings } from "./ActionQuestionSettings";
import { FIELD_CLASS } from "./actionInputsStyles";
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
  tooltip: string;
}> = [
  { value: "text", label: "Type it in", tooltip: "A box to type anything into." },
  { value: "radio", label: "Pick one", tooltip: "A short list to choose from." },
  {
    value: "password",
    label: "Secret",
    tooltip: "Hides what's typed, for tokens and passwords.",
  },
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
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-[12px] font-medium text-[var(--text-secondary)]">
          Before running, ask
        </div>
        {inputs.length > 0 && (
          <div className="text-[12px] text-[var(--text-muted)]">
            Answers fill in the command.
          </div>
        )}
      </div>

      {inputs.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-[var(--text-muted)]">
          Ask a question before running — like which environment to deploy to.
        </p>
      ) : (
        <div className="space-y-2">
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
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
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
    <div className="space-y-2 rounded-lg bg-[var(--bg-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <input
          ref={labelRef}
          value={input.label}
          onChange={(e) => onLabel(e.target.value)}
          placeholder="What to ask for"
          className={FIELD_CLASS}
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove question"
          className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <SegmentedControl
          value={input.type}
          options={TYPE_OPTIONS}
          onChange={onType}
          variant="subtle"
          ariaLabel="Answer type"
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          {open ? "Less" : "More"}
        </button>
        <code
          title="This is what gets replaced in the command"
          className="ml-auto shrink-0 font-mono text-[11px] text-[var(--text-muted)]"
        >
          {`{{${input.key}}}`}
        </code>
      </div>

      {unused && (
        <div className="flex items-center gap-2 text-[11px] text-[var(--accent-amber)]">
          <span>Not used in the command.</span>
          <button
            type="button"
            onClick={onAddToCommand}
            className="font-medium underline underline-offset-2 hover:text-[var(--text-primary)]"
          >
            Add it
          </button>
        </div>
      )}

      {open && (
        <QuestionSettings input={input} problem={problem} onPatch={onPatch} />
      )}
      {!open && problem && (
        <div className="text-[11px] text-[var(--accent-red)]">{problem}</div>
      )}
    </div>
  );
}
