import { basename } from "../../path";
import { ConfirmDialog } from "../ui/ConfirmDialog";

interface FilesReplaceDialogProps {
  open: boolean;
  matches: number;
  files: number;
  replacement: string;
  // Files with unsaved edits, which stay as they are.
  unsaved: string[];
  // The search stopped early, so files it didn't list stay as they are.
  truncated: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function FilesReplaceDialog({
  open,
  matches,
  files,
  replacement,
  unsaved,
  truncated,
  onCancel,
  onConfirm,
}: FilesReplaceDialogProps) {
  const what = `${count(matches, "match", "matches")} in ${count(files, "file", "files")}`;
  return (
    <ConfirmDialog
      open={open}
      title="Replace all"
      confirmLabel={replacement ? "Replace all" : "Delete all"}
      onCancel={onCancel}
      onConfirm={onConfirm}
      body={
        <span className="flex flex-col gap-2">
          <span>
            {replacement ? (
              <>
                Replace {what} with{" "}
                <span className="font-mono text-[var(--text-primary)]">{replacement}</span>?
              </>
            ) : (
              <>Delete {what}? The replacement is empty.</>
            )}
          </span>
          {unsaved.length > 0 && (
            <span>
              {unsaved.length === 1 ? (
                <span className="font-mono text-[var(--text-primary)]">{basename(unsaved[0])}</span>
              ) : (
                `${unsaved.length} files`
              )}{" "}
              {unsaved.length === 1 ? "has" : "have"} unsaved edits and {unsaved.length === 1 ? "stays" : "stay"} as{" "}
              {unsaved.length === 1 ? "it is" : "they are"}.
            </span>
          )}
          {truncated && <span>The search stopped early, so only the files listed change.</span>}
          <span>You can undo it right after.</span>
        </span>
      }
    />
  );
}
