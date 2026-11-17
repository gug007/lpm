import { Folder } from "lucide-react";
import { BrowseFolder } from "../../../bridge/commands";
import { Tooltip } from "../ui/Tooltip";
import { ConfigField } from "./ConfigField";
import { ConfigInput } from "./ConfigInput";

// The project's folder, typed or picked; a project on another machine has no
// local folder to pick, so it's typed only.
export function RootDirectoryField({
  value,
  onChange,
  browsable,
}: {
  value: string;
  onChange: (root: string) => void;
  browsable: boolean;
}) {
  const browse = async () => {
    try {
      const dir = await BrowseFolder(value);
      if (dir) onChange(dir);
    } catch {
      // The user's own picker; cancelling it is normal.
    }
  };
  return (
    <ConfigField label="Root directory">
      <div className="flex gap-1.5">
        <ConfigInput value={value} onChange={onChange} placeholder="~/Projects/my-app" />
        {browsable && (
          <Tooltip content="Choose folder…">
            <button
              type="button"
              onClick={() => void browse()}
              aria-label="Choose folder"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Folder size={14} strokeWidth={1.8} />
            </button>
          </Tooltip>
        )}
      </div>
    </ConfigField>
  );
}
