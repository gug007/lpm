import { Plus } from "lucide-react";
import { TrashIcon } from "../icons";
import { ConfigField } from "./ConfigField";
import { ICON_ACTION_DANGER, TEXT_ACTION } from "../ui/buttons";
import { CONFIG_INPUT_SMALL } from "./configFormStyles";

export function ConfigEnvEditor({ entries, onChange }: { entries: [string, string][]; onChange: (v: [string, string][]) => void }) {
  const set = (i: number, entry: [string, string]) => {
    const next = [...entries] as [string, string][];
    next[i] = entry;
    onChange(next);
  };
  return (
    <ConfigField label="Environment variables">
      <div className="flex flex-col gap-1.5">
        {entries.map(([k, v], i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={k}
              onChange={(e) => set(i, [e.target.value, v])}
              placeholder="KEY"
              spellCheck={false}
              className={`${CONFIG_INPUT_SMALL} w-1/3 font-mono`}
            />
            <input
              type="text"
              value={v}
              onChange={(e) => set(i, [k, e.target.value])}
              placeholder="value"
              spellCheck={false}
              className={`${CONFIG_INPUT_SMALL} flex-1 font-mono`}
            />
            <button
              type="button"
              onClick={() => onChange(entries.filter((_, j) => j !== i))}
              aria-label="Remove variable"
              className={ICON_ACTION_DANGER}
            >
              <TrashIcon size={13} />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...entries, ["", ""]])} className={`-ml-1.5 self-start ${TEXT_ACTION}`}>
          <Plus size={13} strokeWidth={2} />
          Add variable
        </button>
      </div>
    </ConfigField>
  );
}
