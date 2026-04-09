import { Modal } from "./ui/Modal";
import { ZapIcon, TerminalIcon, LayersIcon } from "./icons";
import { PlayIcon } from "./project-detail/icons";

export type NewItemType = "service" | "action" | "terminal" | "profile";

interface AddNewPickerProps {
  open: boolean;
  onClose: () => void;
  onPick: (type: NewItemType) => void;
}

const items: { type: NewItemType; icon: React.ReactNode; label: string; desc: string; sub: string }[] = [
  {
    type: "service",
    icon: <ZapIcon />,
    label: "Service",
    desc: "Something that runs in the background while you work \u2014",
    sub: "like a frontend dev server, backend API, or a database",
  },
  {
    type: "action",
    icon: <PlayIcon />,
    label: "Action",
    desc: "A command you run once when you need it \u2014",
    sub: "like deploying, running tests, or resetting a database",
  },
  {
    type: "terminal",
    icon: <TerminalIcon />,
    label: "Terminal",
    desc: "A ready-to-go terminal tab with a command already set up \u2014",
    sub: "like Claude Code, Codex, or a shell in a specific folder",
  },
  {
    type: "profile",
    icon: <LayersIcon />,
    label: "Profile",
    desc: "A group of services to start together \u2014",
    sub: 'for example "backend only" or "full stack"',
  },
];

export function AddNewPicker({ open, onClose, onPick }: AddNewPickerProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="w-[320px] rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 shadow-xl"
    >
      <h3 className="text-[13px] font-medium text-[var(--text-primary)]">
        What would you like to add?
      </h3>
      <div className="mt-4 flex flex-col gap-1">
        {items.map((item) => (
          <button
            key={item.type}
            onClick={() => { onPick(item.type); onClose(); }}
            className="flex items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-[var(--bg-hover)]"
          >
            <span className="mt-px shrink-0 text-[var(--text-secondary)]">{item.icon}</span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--text-primary)]">{item.label}</div>
              <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                {item.desc}
                <br />
                {item.sub}
              </div>
            </div>
          </button>
        ))}
      </div>
    </Modal>
  );
}
