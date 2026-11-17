import { Plus } from "lucide-react";
import type { ActionInputEntry } from "../../visualConfigYaml";
import { TrashIcon } from "../icons";
import { ConfigField } from "./ConfigField";
import { ICON_ACTION_DANGER, TEXT_ACTION } from "../ui/buttons";
import { CONFIG_INPUT_SMALL } from "./configFormStyles";

const EMPTY_INPUT: ActionInputEntry = {
  key: "",
  label: "",
  type: "text",
  required: false,
  placeholder: "",
  default: "",
  persist: false,
};

export function ConfigInputsEditor({ entries, onChange }: { entries: ActionInputEntry[]; onChange: (v: ActionInputEntry[]) => void }) {
  const set = (i: number, patch: Partial<ActionInputEntry>) => {
    const next = [...entries];
    next[i] = { ...entries[i], ...patch };
    onChange(next);
  };
  return (
    <ConfigField label="Input prompts">
      <div className="flex flex-col gap-3">
        {entries.map((inp, i) => (
          <div key={i} className="flex flex-col gap-1.5 border-l-2 border-[var(--border)] pl-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inp.key}
                onChange={(e) => set(i, { key: e.target.value })}
                placeholder="key"
                spellCheck={false}
                className={`${CONFIG_INPUT_SMALL} w-1/3 font-mono`}
              />
              <input
                type="text"
                value={inp.label}
                onChange={(e) => set(i, { label: e.target.value })}
                placeholder="Label"
                className={`${CONFIG_INPUT_SMALL} flex-1`}
              />
              <button
                type="button"
                onClick={() => onChange(entries.filter((_, j) => j !== i))}
                aria-label="Remove input"
                className={ICON_ACTION_DANGER}
              >
                <TrashIcon size={13} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={inp.type}
                onChange={(e) => set(i, { type: e.target.value })}
                className={`${CONFIG_INPUT_SMALL} w-1/4`}
              >
                <option value="text">text</option>
                <option value="password">password</option>
              </select>
              <input
                type="text"
                value={inp.placeholder}
                onChange={(e) => set(i, { placeholder: e.target.value })}
                placeholder="Placeholder"
                className={`${CONFIG_INPUT_SMALL} flex-1`}
              />
              <input
                type="text"
                value={inp.default}
                onChange={(e) => set(i, { default: e.target.value })}
                placeholder="Default"
                className={`${CONFIG_INPUT_SMALL} flex-1`}
              />
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={inp.required}
                  onChange={(e) => set(i, { required: e.target.checked })}
                  className="accent-[var(--accent-blue)]"
                />
                <span className="text-[12px] text-[var(--text-secondary)]">Required</span>
              </label>
              <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={inp.persist}
                  onChange={(e) => set(i, { persist: e.target.checked })}
                  className="accent-[var(--accent-blue)]"
                />
                <span className="text-[12px] text-[var(--text-secondary)]">Persist</span>
              </label>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...entries, EMPTY_INPUT])} className={`-ml-1.5 self-start ${TEXT_ACTION}`}>
          <Plus size={13} strokeWidth={2} />
          Add input
        </button>
      </div>
    </ConfigField>
  );
}
