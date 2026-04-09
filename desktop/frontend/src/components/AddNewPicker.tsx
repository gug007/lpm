import { Modal } from "./ui/Modal";
import { ZapIcon, TerminalIcon, LayersIcon } from "./icons";
import { PlayIcon } from "./project-detail/icons";

export type NewItemType = "service" | "action" | "terminal" | "profile";

interface AddNewPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: NewItemType) => void;
}

const items: { type: NewItemType; icon: React.ReactNode; label: string; desc: string }[] = [
  {
    type: "service",
    icon: <ZapIcon />,
    label: "Service",
    desc: "Something that runs in the background while you work \u2014 like a frontend dev server, backend API, or a database",
  },
  {
    type: "action",
    icon: <PlayIcon />,
    label: "Action",
    desc: "A command you run once when you need it \u2014 like deploying, running tests, or resetting a database",
  },
  {
    type: "terminal",
    icon: <TerminalIcon />,
    label: "Terminal",
    desc: "A ready-to-go terminal tab with a command already set up \u2014 like Claude Code, Codex, or a shell in a specific folder",
  },
  {
    type: "profile",
    icon: <LayersIcon />,
    label: "Profile",
    desc: "A group of services to start together \u2014 for example \"backend only\" or \"full stack\"",
  },
];

export function AddNewPicker({ open, onClose, onPick }: AddNewPickerProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[340px] rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] px-2 pb-2 pt-5 shadow-2xl"
    >
      <h3 className="px-4 text-[13px] font-medium text-[var(--text-primary)]">
        What would you like to add?
      </h3>
      <div className="mt-3 flex flex-col">
        {items.map((item) => (
          <button
            key={item.type}
            onClick={() => { onPick(item.type); onClose(); }}
            className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
          >
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors group-hover:bg-[var(--bg-active)] group-hover:text-[var(--text-primary)]">
              {item.icon}
            </div>
            <div className="min-w-0 pt-0.5">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">{item.label}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {item.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
