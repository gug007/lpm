import { useMemo } from "react";
import { useAppStore } from "../store/app";
import { CloudBranchIcon, FolderIcon, ServerIcon } from "./icons";
import { Modal } from "./ui/Modal";
import { DrillMenu, type DrillScreen } from "./DrillMenu";
import { MenuSplitRow } from "./MenuSplitRow";
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
    const generatorsScreen: DrillScreen = { title: "New", width: "w-72", render: () => <GeneratorList /> };
    return {
      render: (api) => (
        <div>
          <h3 className="px-4 pb-1.5 pt-1 text-[13px] font-medium text-[var(--text-primary)]">Add a project</h3>
          {NEW_PROJECT_SOURCES.map((s) => (
            <button
              key={s.key}
              onClick={() => onPick(s.key)}
              className="flex w-full items-start gap-2.5 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span style={{ color: s.color }} className="mt-px flex h-5 w-5 shrink-0 items-center justify-center [&_svg]:h-[18px] [&_svg]:w-[18px]">
                {s.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-[var(--text-primary)]">{s.label}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-[var(--text-muted)]">{s.desc}</span>
              </span>
            </button>
          ))}
          <div className="mx-2 my-1 border-t border-[var(--border)]" />
          <MenuSplitRow
            icon={<span className="flex h-5 w-5 shrink-0 items-center justify-center text-[13px]">✨</span>}
            label="New"
            hasDefault={false}
            onRun={() => api.push(generatorsScreen)}
            onConfigure={() => api.push(generatorsScreen)}
          />
        </div>
      ),
    };
  }, [onPick]);

  return (
    <Modal open={open} onClose={onClose} zIndexClassName="z-50">
      <DrillMenu root={root} onClose={onClose} widthClassName="w-[350px]" />
    </Modal>
  );
}
