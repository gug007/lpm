import { useAppStore } from "../store/app";
import { CloudBranchIcon, FolderIcon, ServerIcon } from "./icons";
import { IconListMenu, type IconListMenuItem } from "./ui/IconListMenu";

export type NewProjectKind = "local" | "ssh" | "clone";

const items: IconListMenuItem<NewProjectKind>[] = [
  {
    key: "local",
    icon: <FolderIcon />,
    color: "#facc15",
    label: "Local Folder",
    desc: "A project on this machine — pick a folder on disk",
  },
  {
    key: "clone",
    icon: <CloudBranchIcon />,
    color: "#a78bfa",
    label: "Clone Repository",
    desc: "Clone from a Git repo URL into a local folder",
  },
  {
    key: "ssh",
    icon: <ServerIcon />,
    color: "#22d3ee",
    label: "SSH Host",
    desc: "Connect to a remote machine over SSH",
  },
];

export function NewProjectPicker() {
  const open = useAppStore((s) => s.addProjectPickerOpen);
  const onClose = useAppStore((s) => s.closeAddProjectPicker);
  const onPick = useAppStore((s) => s.pickAddProjectKind);

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
