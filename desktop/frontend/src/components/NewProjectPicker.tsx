import { FolderIcon, ServerIcon } from "./icons";
import { IconListMenu, type IconListMenuItem } from "./ui/IconListMenu";

export type NewProjectKind = "local" | "ssh";

interface NewProjectPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (kind: NewProjectKind) => void;
}

const items: IconListMenuItem<NewProjectKind>[] = [
  {
    key: "local",
    icon: <FolderIcon />,
    color: "#facc15",
    label: "Local Folder",
    desc: "A project on this machine — pick a folder on disk",
  },
  {
    key: "ssh",
    icon: <ServerIcon />,
    color: "#22d3ee",
    label: "SSH Host",
    desc: "Connect to a remote machine over SSH",
  },
];

export function NewProjectPicker({ open, onClose, onPick }: NewProjectPickerProps) {
  return (
    <IconListMenu
      open={open}
      title="Add a project"
      items={items}
      width={360}
      closeOnPick={false}
      onClose={onClose}
      onPick={onPick}
    />
  );
}
