import type { CommandRef, CommandScope } from "../../lpmCommands";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { folderLabel } from "./commandFolders";

export type Confirm =
  | { kind: "discard"; then: () => void }
  | { kind: "delete"; targets: CommandRef[] }
  | { kind: "folder"; scope: CommandScope; name: string; count: number };

interface CommandsConfirmProps {
  confirm: Confirm | null;
  onCancel: () => void;
  onConfirm: (confirm: Confirm) => void;
}

function title(c: Confirm): string {
  if (c.kind === "discard") return "Discard your changes?";
  if (c.kind === "folder") return `Delete the ${folderLabel(c.name)} folder?`;
  return c.targets.length === 1 ? `Delete /${c.targets[0].name}?` : `Delete ${c.targets.length} skills?`;
}

function body(c: Confirm): string {
  if (c.kind === "discard") return "The skill you're editing has changes that aren't saved.";
  if (c.kind === "folder") return c.count > 0 ? "What's inside moves up a level." : "It's empty.";
  return c.targets.length === 1 ? "Its file is deleted." : "Their files are deleted.";
}

// What the Skills tab asks before it drops unsaved changes or deletes anything.
export function CommandsConfirm({ confirm, onCancel, onConfirm }: CommandsConfirmProps) {
  return (
    <ConfirmDialog
      open={confirm !== null}
      title={confirm ? title(confirm) : ""}
      body={confirm ? body(confirm) : ""}
      confirmLabel={confirm?.kind === "discard" ? "Discard" : "Delete"}
      variant="destructive"
      onCancel={onCancel}
      onConfirm={() => confirm && onConfirm(confirm)}
    />
  );
}
