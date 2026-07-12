import { useState } from "react";
import { createFolder, type Folder } from "../store/messageHistory";

interface NewFolderInputProps {
  className: string;
  onCreated: (folder: Folder) => void;
  onCancel: () => void;
}

// Shared inline "name a new folder" field used by the collection bar and the
// per-row move-to-folder menu. data-folder-input lets the history popover's
// Escape guard cancel just this input instead of closing the whole popover.
export function NewFolderInput({ className, onCreated, onCancel }: NewFolderInputProps) {
  const [name, setName] = useState("");
  const submit = async () => {
    const folder = await createFolder(name);
    if (folder) onCreated(folder);
    else onCancel();
  };
  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void submit();
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        }
      }}
      onBlur={onCancel}
      placeholder="Folder name"
      autoFocus
      data-folder-input
      className={className}
    />
  );
}
