import { ZapIcon, TerminalIcon, LayersIcon } from "./icons";
import { PlayIcon } from "./project-detail/icons";
import { IconListMenu, type IconListMenuItem } from "./ui/IconListMenu";

export type NewItemType = "service" | "action" | "terminal" | "profile";

interface AddNewPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: NewItemType) => void;
}

const items: IconListMenuItem<NewItemType>[] = [
  {
    key: "service",
    icon: <ZapIcon />,
    color: "#facc15",
    label: "Service",
    desc: "Something that runs in the background while you work - like a frontend dev server, backend API, or a database",
  },
  {
    key: "action",
    icon: <PlayIcon />,
    color: "#10b981",
    label: "Action",
    desc: "A command you run once when you need it - like deploying, running tests, or resetting a database",
  },
  {
    key: "terminal",
    icon: <TerminalIcon />,
    color: "#22d3ee",
    label: "Terminal",
    desc: "A ready-to-go terminal tab with a command already set up - like Claude Code, Codex, or a shell in a specific folder",
  },
  {
    key: "profile",
    icon: <LayersIcon />,
    color: "#a78bfa",
    label: "Profile",
    desc: "A group of services to start together - for example \"backend only\" or \"full stack\"",
  },
];

export function AddNewPicker({ open, onClose, onPick }: AddNewPickerProps) {
  return (
    <IconListMenu
      open={open}
      title="What would you like to add?"
      items={items}
      onClose={onClose}
      onPick={onPick}
    />
  );
}
