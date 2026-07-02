import { useMemo } from "react";
import { useAppStore } from "../store/app";
import { ChevronRightIcon, CloudBranchIcon, FolderIcon, ServerIcon } from "./icons";
import { Modal } from "./ui/Modal";
import { DrillMenu, type DrillScreen } from "./DrillMenu";
import { GeneratorList } from "./GeneratorList";
import type { IconListMenuItem } from "./ui/IconListMenu";

export type NewProjectKind = "local" | "ssh" | "clone";

export const NEW_PROJECT_SOURCES: IconListMenuItem<NewProjectKind>[] = [
  { key: "local", icon: <FolderIcon />, color: "#facc15", label: "Local Folder", desc: "A project on this machine — pick a folder on disk" },
  { key: "clone", icon: <CloudBranchIcon />, color: "#a78bfa", label: "Clone Repository", desc: "Clone from a Git repo URL into a local folder" },
  { key: "ssh", icon: <ServerIcon />, color: "#22d3ee", label: "SSH Host", desc: "Connect to a remote machine over SSH" },
];

export function NewProjectPicker() {
  const open = useAppStore((s) => s.addProjectPickerOpen);
  const onClose = useAppStore((s) => s.closeAddProjectPicker);
  const onPick = useAppStore((s) => s.pickAddProjectKind);

  const root = useMemo<DrillScreen>(() => {
    const generatorsScreen: DrillScreen = { title: "New", render: () => <GeneratorList /> };
    return {
      render: (api) => (
        <div className="px-2 pb-1 pt-3.5">
          <h3 className="px-4 text-[13px] font-medium text-[var(--text-primary)]">Add a project</h3>
          <div className="mt-3 flex flex-col">
            {NEW_PROJECT_SOURCES.map((s) => (
              <button
                key={s.key}
                onClick={() => onPick(s.key)}
                className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
              >
                <div
                  className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] transition-colors group-hover:bg-[var(--bg-active)] [&_svg]:h-[22px] [&_svg]:w-[22px]"
                  style={{ color: s.color }}
                >
                  {s.icon}
                </div>
                <div className="min-w-0 pt-0.5">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">{s.label}</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">{s.desc}</div>
                </div>
              </button>
            ))}
            <button
              onClick={() => api.push(generatorsScreen)}
              className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
            >
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[19px] leading-none transition-colors group-hover:bg-[var(--bg-active)]">
                ✨
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">New</div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">Generate a new project from a template</div>
              </div>
              <span className="mt-2 flex shrink-0 text-[var(--text-muted)]">
                <ChevronRightIcon />
              </span>
            </button>
          </div>
        </div>
      ),
    };
  }, [onPick]);

  return (
    <Modal open={open} onClose={onClose} zIndexClassName="z-50">
      <DrillMenu root={root} onClose={onClose} widthClassName="w-[360px]" />
    </Modal>
  );
}
