import { Modal } from "./Modal";

export interface IconListMenuItem<T extends string> {
  key: T;
  icon: React.ReactNode;
  color: string;
  label: string;
  desc: string;
}

interface IconListMenuProps<T extends string> {
  open: boolean;
  title: string;
  items: IconListMenuItem<T>[];
  width?: number;
  closeOnPick?: boolean;
  onClose: () => void;
  onPick: (key: T) => void;
}

export function IconListMenu<T extends string>({
  open,
  title,
  items,
  width = 340,
  closeOnPick = true,
  onClose,
  onPick,
}: IconListMenuProps<T>) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndexClassName="z-[60]"
      contentClassName="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] px-2 pb-2 pt-5 shadow-2xl"
    >
      <div style={{ width }}>
        <h3 className="px-4 text-[13px] font-medium text-[var(--text-primary)]">
          {title}
        </h3>
        <div className="mt-3 flex flex-col">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                onPick(item.key);
                if (closeOnPick) onClose();
              }}
              className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
            >
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] transition-colors group-hover:bg-[var(--bg-active)] [&_svg]:h-[22px] [&_svg]:w-[22px]"
                style={{ color: item.color }}
              >
                {item.icon}
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  {item.label}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {item.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}
