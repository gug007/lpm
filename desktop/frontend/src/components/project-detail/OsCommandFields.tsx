import { useState } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { XIcon } from "../icons";

export type OsCmdKey = "cmdMacos" | "cmdLinux" | "cmdWindows";

export const OS_CMDS: readonly { key: OsCmdKey; label: string }[] = [
  { key: "cmdMacos", label: "macOS" },
  { key: "cmdLinux", label: "Linux" },
  { key: "cmdWindows", label: "Windows" },
];

interface OsCommandFieldsProps {
  values: Record<OsCmdKey, string>;
  field: (key: OsCmdKey) => UseFormRegisterReturn;
  onClear: (key: OsCmdKey) => void;
  textareaClass: string;
}

// Under a command: what runs in its place on one system, added per system.
// A system with none runs the command above.
export function OsCommandFields({ values, field, onClear, textareaClass }: OsCommandFieldsProps) {
  const [opened, setOpened] = useState<OsCmdKey[]>(() => OS_CMDS.filter((o) => values[o.key]).map((o) => o.key));
  const shown = OS_CMDS.filter((o) => opened.includes(o.key) || values[o.key]);
  const others = OS_CMDS.filter((o) => !shown.includes(o));

  return (
    <div className="space-y-2">
      {shown.map((o) => (
        <div key={o.key} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor={`os-cmd-${o.key}`} className="text-[12px] font-medium text-[var(--text-secondary)]">
              On {o.label}
            </label>
            <button
              type="button"
              onClick={() => {
                onClear(o.key);
                setOpened((list) => list.filter((k) => k !== o.key));
              }}
              aria-label={`Remove the ${o.label} command`}
              title={`Remove the ${o.label} command`}
              className="rounded-md p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] [&>svg]:h-3.5 [&>svg]:w-3.5"
            >
              <XIcon />
            </button>
          </div>
          <textarea
            id={`os-cmd-${o.key}`}
            rows={1}
            placeholder={`What runs on ${o.label} instead`}
            className={textareaClass}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            {...field(o.key)}
          />
        </div>
      ))}
      {others.length > 0 && (
        <p className="text-[12px] text-[var(--text-muted)]">
          Different command on{" "}
          {others.map((o, i) => (
            <span key={o.key}>
              {i > 0 && (i === others.length - 1 ? " or " : ", ")}
              <button
                type="button"
                onClick={() => setOpened((list) => [...list, o.key])}
                className="text-[var(--text-secondary)] underline decoration-[var(--border)] underline-offset-2 transition-colors hover:text-[var(--text-primary)]"
              >
                {o.label}
              </button>
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
