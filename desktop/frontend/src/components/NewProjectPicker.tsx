import { useMemo } from "react";
import { Smartphone } from "lucide-react";
import { useAppStore } from "../store/app";
import { MACHINE } from "../machineWords";
import { CheckIcon, ChevronRightIcon, CloudBranchIcon, FolderIcon, ServerIcon } from "./icons";
import { Modal } from "./ui/Modal";
import { DrillMenu, type DrillScreen } from "./DrillMenu";
import { ServerModeScreen } from "./ServerModeScreen";
import { InstallLpmScreen } from "./InstallLpmScreen";
import { AnotherComputerScreen } from "./AnotherComputerScreen";
import { PhoneScreen } from "./mobile/PhoneScreen";
import { LaptopIcon } from "./connections/LaptopIcon";
import { ServerHosts } from "./connections/ServerHosts";
import type { IconListMenuItem } from "./ui/IconListMenu";

export type NewProjectKind = "local" | "ssh" | "clone";

const WIDE_SCREEN = "w-[400px]";
const SETTINGS_SCREEN = "w-[600px]";

export const NEW_PROJECT_SOURCES: IconListMenuItem<NewProjectKind>[] = [
  { key: "local", icon: <FolderIcon />, color: "#facc15", label: "Local folder", desc: "Pick a folder on disk" },
  { key: "clone", icon: <CloudBranchIcon />, color: "#a78bfa", label: "Clone repository", desc: "Clone from a Git repo URL into a local folder" },
];

const SECTION_LABEL =
  "px-4 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-muted)]";

// On a remote Mac only folder + clone make sense, and the copy points at that
// Mac. Servers and other computers are hidden.
function remoteSources(alias: string): IconListMenuItem<NewProjectKind>[] {
  return [
    { key: "local", icon: <FolderIcon />, color: "#facc15", label: "Local folder", desc: `A folder already on ${alias}` },
    { key: "clone", icon: <CloudBranchIcon />, color: "#a78bfa", label: "Clone repository", desc: `Clone from a Git repo URL into a folder on ${alias}` },
  ];
}

export function NewProjectPicker() {
  const open = useAppStore((s) => s.addProjectPickerOpen);
  const onClose = useAppStore((s) => s.closeAddProjectPicker);
  const onPick = useAppStore((s) => s.pickAddProjectKind);
  const target = useAppStore((s) => s.addProjectTarget);
  const start = useAppStore((s) => s.addProjectStart);

  const { root, linuxHostStack, computerStack, phoneStack } = useMemo(() => {
    const installScreen: DrillScreen = { title: "Linux host", width: WIDE_SCREEN, render: () => <InstallLpmScreen /> };
    const computerScreen: DrillScreen = {
      title: "Another computer",
      width: SETTINGS_SCREEN,
      render: () => <AnotherComputerScreen />,
    };
    const phoneScreen: DrillScreen = {
      title: "Phone",
      width: SETTINGS_SCREEN,
      render: () => <PhoneScreen />,
    };
    const serverScreen: DrillScreen = {
      title: "Server",
      width: SETTINGS_SCREEN,
      render: (api) => (
        <div className="max-h-[min(720px,80vh)] overflow-y-auto pb-1">
          <ServerModeScreen onInstall={() => api.push(installScreen)} onSsh={() => onPick("ssh")} />
          <div className="px-4 pb-4 empty:hidden">
            <ServerHosts />
          </div>
        </div>
      ),
    };
    const sources = target ? remoteSources(target.alias) : NEW_PROJECT_SOURCES;
    const heading = target ? `Add a project on ${target.alias}` : "Add a project";
    const root: DrillScreen = {
      render: (api) => (
        <div className="px-2 pb-1 pt-3.5">
          <h3 className="px-4 text-[13px] font-medium text-[var(--text-primary)]">{heading}</h3>
          {target?.connected && (
            <p className="mx-4 mt-2.5 flex items-start gap-2 rounded-lg bg-[color-mix(in_srgb,var(--accent-green)_8%,transparent)] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--accent-green-text)]">
              <span className="mt-[3px] flex shrink-0">
                <CheckIcon />
              </span>
              <span>
                Connected. <span className="text-[var(--text-secondary)]">Its projects now show in your sidebar.</span>
              </span>
            </p>
          )}
          <div className={target ? "mt-3 flex flex-col" : "mt-1 flex flex-col"}>
            {!target && <h4 className={SECTION_LABEL}>On {MACHINE.thisMachine}</h4>}
            {sources.map((s) => (
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
            {!target && (
              <>
                <div className="mx-4 mt-2 h-px bg-[var(--border)]" />
                <h4 className={SECTION_LABEL}>Remote</h4>
              </>
            )}
            {!target && (
              <button
                onClick={() => api.push(serverScreen)}
                className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[#22d3ee] transition-colors group-hover:bg-[var(--bg-active)] [&_svg]:h-[22px] [&_svg]:w-[22px]">
                  <ServerIcon />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">Server</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    Set it up as a Linux host for many projects, or open one folder over SSH
                  </div>
                </div>
                <span className="mt-2 flex shrink-0 text-[var(--text-muted)]">
                  <ChevronRightIcon />
                </span>
              </button>
            )}
            {!target && (
              <button
                onClick={() => api.push(computerScreen)}
                className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[#4ade80] transition-colors group-hover:bg-[var(--bg-active)]">
                  <LaptopIcon size={22} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">Another computer</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    A Mac or PC running lpm — open its projects here
                  </div>
                </div>
                <span className="mt-2 flex shrink-0 text-[var(--text-muted)]">
                  <ChevronRightIcon />
                </span>
              </button>
            )}
            {!target && (
              <button
                onClick={() => api.push(phoneScreen)}
                className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[var(--bg-hover)]"
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-hover)] text-[#60a5fa] transition-colors group-hover:bg-[var(--bg-active)]">
                  <Smartphone size={22} strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">Phone</div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                    Control your projects from lpm Link on iPhone or iPad
                  </div>
                </div>
                <span className="mt-2 flex shrink-0 text-[var(--text-muted)]">
                  <ChevronRightIcon />
                </span>
              </button>
            )}
          </div>
        </div>
      ),
    };
    return {
      root,
      linuxHostStack: [serverScreen, installScreen],
      computerStack: [computerScreen],
      phoneStack: [phoneScreen],
    };
  }, [onPick, target]);

  const startStack =
    target || !start
      ? undefined
      : { "linux-host": linuxHostStack, computer: computerStack, phone: phoneStack }[start];

  // Keyed by target so pairing a server from the Linux host screen lands on
  // that server's own root, not the screen the pairing started from.
  return (
    <Modal open={open} onClose={onClose} zIndexClassName="z-50">
      <DrillMenu
        key={`${target?.slug ?? ""}:${start ?? ""}`}
        root={root}
        initialStack={startStack}
        onClose={onClose}
        widthClassName="w-[360px]"
      />
    </Modal>
  );
}
