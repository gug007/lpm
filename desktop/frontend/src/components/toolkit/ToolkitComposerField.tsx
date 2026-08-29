import type { ReactNode } from "react";
import type { ComposerValue } from "../../composerValue";
import { InputComposer } from "../InputComposer";
import { LABEL } from "./OptionCard";

interface ToolkitComposerFieldProps {
  label: ReactNode;
  // Names the field for the tests and for anything querying the form.
  name: string;
  value: ComposerValue;
  onChange: (value: ComposerValue) => void;
  // The composer seeds from `value` on mount only, so prose arriving any way
  // but typing — an AI draft, its undo, a reload — lands by remounting. Hosts
  // bump this whenever they write the field themselves.
  seed: number;
  placeholder: string;
  // Project root the rewrite actions read for context; also what offers them.
  cwd: string;
  note?: ReactNode;
  error?: string | null;
  figure?: ReactNode;
  autoFocus?: boolean;
  disabled?: boolean;
}

// A labelled prose field, written in the app's own composer: what goes in these
// boxes is a prompt like any other, so it is written the way prompts are written
// everywhere else here — dictated, or handed to the AI to rewrite — rather than
// typed into a bare box. The meta line rides in the composer's own footer beside
// those buttons, so the field stays two rows tall instead of three.
export function ToolkitComposerField({
  label,
  name,
  value,
  onChange,
  seed,
  placeholder,
  cwd,
  note,
  error,
  figure,
  autoFocus,
  disabled,
}: ToolkitComposerFieldProps) {
  const meta = error ?? note;
  return (
    <div data-field={name} className="flex flex-col">
      <span className={LABEL}>{label}</span>
      <InputComposer
        key={seed}
        defaultValue={value}
        onChange={onChange}
        placeholder={placeholder}
        aiCwd={cwd}
        autoFocus={autoFocus}
        disabled={disabled}
        footer={
          meta || figure ? (
            <>
              <span
                className={`min-w-0 flex-1 truncate text-[10.5px] ${
                  error ? "text-[var(--accent-red-text)]" : "text-[var(--text-muted)]"
                }`}
              >
                {meta}
              </span>
              {figure && (
                <span className="shrink-0 text-[10.5px] tabular-nums text-[var(--text-muted)]">
                  {figure}
                </span>
              )}
            </>
          ) : null
        }
      />
    </div>
  );
}
