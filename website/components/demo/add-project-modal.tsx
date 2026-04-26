"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File as FileIcon,
  Folder,
  Home,
  Search,
  Server,
} from "lucide-react";

function FilledFolder({ size = 13 }: { size?: number }) {
  return (
    <Folder
      width={size}
      height={size}
      fill="#5a93f0"
      stroke="#5a93f0"
      strokeWidth={1.5}
    />
  );
}

export type NewProjectKind = "local" | "ssh";

export type NewProjectInput = {
  kind: NewProjectKind;
  name: string;
  host?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
};

type Phase = "pick" | "local" | "ssh";

type FsNode = {
  name: string;
  kind: "folder" | "file";
  children?: FsNode[];
};

const PROJECTS_FS: FsNode[] = [
  {
    name: "saas-app",
    kind: "folder",
    children: [
      { name: "node_modules", kind: "folder", children: [] },
      { name: "public", kind: "folder", children: [] },
      { name: "src", kind: "folder", children: [] },
      { name: "package.json", kind: "file" },
      { name: "README.md", kind: "file" },
      { name: "tsconfig.json", kind: "file" },
    ],
  },
  {
    name: "auth-service",
    kind: "folder",
    children: [
      { name: "cmd", kind: "folder", children: [] },
      { name: "internal", kind: "folder", children: [] },
      { name: "go.mod", kind: "file" },
      { name: "go.sum", kind: "file" },
      { name: "README.md", kind: "file" },
    ],
  },
  {
    name: "docs-site",
    kind: "folder",
    children: [
      { name: "public", kind: "folder", children: [] },
      { name: "src", kind: "folder", children: [] },
      { name: "astro.config.mjs", kind: "file" },
      { name: "package.json", kind: "file" },
    ],
  },
  {
    name: "ml-pipeline",
    kind: "folder",
    children: [
      { name: "data", kind: "folder", children: [] },
      { name: "notebooks", kind: "folder", children: [] },
      { name: "pipeline", kind: "folder", children: [] },
      { name: "requirements.txt", kind: "file" },
    ],
  },
  {
    name: "client-portal",
    kind: "folder",
    children: [
      { name: "app", kind: "folder", children: [] },
      { name: "components", kind: "folder", children: [] },
      { name: "package.json", kind: "file" },
    ],
  },
  {
    name: "mobile-app",
    kind: "folder",
    children: [
      { name: "android", kind: "folder", children: [] },
      { name: "ios", kind: "folder", children: [] },
      { name: "src", kind: "folder", children: [] },
    ],
  },
  {
    name: "data-warehouse",
    kind: "folder",
    children: [
      { name: "dbt", kind: "folder", children: [] },
      { name: "queries", kind: "folder", children: [] },
      { name: "README.md", kind: "file" },
    ],
  },
];

const HOME_FS: FsNode[] = [
  { name: "Applications", kind: "folder", children: [] },
  { name: "Desktop", kind: "folder", children: [] },
  { name: "Documents", kind: "folder", children: [] },
  { name: "Downloads", kind: "folder", children: [] },
  { name: "Movies", kind: "folder", children: [] },
  { name: "Music", kind: "folder", children: [] },
  { name: "Pictures", kind: "folder", children: [] },
  { name: "Projects", kind: "folder", children: PROJECTS_FS },
  { name: "Public", kind: "folder", children: [] },
];

const SIDEBAR_FAVORITES = [
  "Applications",
  "Desktop",
  "Documents",
  "Downloads",
];

function getColumns(roots: FsNode[], path: string[]): FsNode[][] {
  const cols: FsNode[][] = [roots];
  let current: FsNode[] = roots;
  for (const segment of path) {
    const found = current.find((n) => n.name === segment);
    if (!found || !found.children) break;
    cols.push(found.children);
    current = found.children;
  }
  return cols;
}

export function DemoAddProjectModal({ open, onClose, onCreate }: Props) {
  const [phase, setPhase] = useState<Phase>("pick");
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [path, setPath] = useState<string[]>(["Projects"]);
  const sshNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (phase === "ssh") sshNameRef.current?.focus();
  }, [phase]);

  if (!open) return null;

  const reset = () => {
    setPhase("pick");
    setName("");
    setHost("");
    setPath(["Projects"]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitSsh = () => {
    const trimmed = name.trim();
    const h = host.trim();
    if (!trimmed || !h) return;
    onCreate({ kind: "ssh", name: trimmed, host: h });
    reset();
  };

  const handleOpenFolder = (folderName: string) => {
    onCreate({ kind: "local", name: folderName });
    reset();
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={handleClose}
        className="absolute inset-0 bg-black/50"
      />

      {phase === "pick" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-project-title"
          className="relative w-[360px] rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] px-2 pb-2 pt-5 shadow-2xl"
        >
          <h3
            id="add-project-title"
            className="px-4 text-[13px] font-medium text-[#e5e5e5]"
          >
            Add a project
          </h3>
          <div className="mt-3 flex flex-col">
            <button
              type="button"
              onClick={() => setPhase("local")}
              className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[#2a2a2a]"
            >
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2a] transition-colors group-hover:bg-[#333333]"
                style={{ color: "#facc15" }}
              >
                <Folder size={22} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] font-medium text-[#e5e5e5]">
                  Local Folder
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">
                  A project on this machine — pick a folder on disk
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setPhase("ssh")}
              className="group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[#2a2a2a]"
            >
              <div
                className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2a] transition-colors group-hover:bg-[#333333]"
                style={{ color: "#22d3ee" }}
              >
                <Server size={22} strokeWidth={1.5} />
              </div>
              <div className="min-w-0 pt-0.5">
                <div className="text-[13px] font-medium text-[#e5e5e5]">
                  SSH Host
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[#919191]">
                  Connect to a remote machine over SSH
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {phase === "local" && (
        <FolderPicker
          path={path}
          onPathChange={setPath}
          onCancel={handleClose}
          onBack={() => setPhase("pick")}
          onOpenFolder={handleOpenFolder}
        />
      )}

      {phase === "ssh" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ssh-host-title"
          className="relative w-[360px] rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] px-5 pb-5 pt-4 shadow-2xl"
        >
          <button
            type="button"
            onClick={() => setPhase("pick")}
            className="mb-3 flex items-center gap-1 text-[11px] text-[#919191] transition-colors hover:text-[#e5e5e5]"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
            Back
          </button>
          <h3 id="ssh-host-title" className="text-[13px] font-medium text-[#e5e5e5]">
            Add an SSH host
          </h3>

          <form
            className="mt-4 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              submitSsh();
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
                Project name
              </span>
              <input
                ref={sshNameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="remote-api"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="rounded-md bg-[#242424] px-2.5 py-1.5 text-[12px] font-mono text-[#e5e5e5] placeholder:text-[#666] outline-none border border-[#2e2e2e] focus:border-[#5a5a5a]"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-[#919191]">
                Host
              </span>
              <input
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="user@host.example.com"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                className="rounded-md bg-[#242424] px-2.5 py-1.5 text-[12px] font-mono text-[#e5e5e5] placeholder:text-[#666] outline-none border border-[#2e2e2e] focus:border-[#5a5a5a]"
              />
              <span className="text-[10px] text-[#666]">
                Hosts come from{" "}
                <span className="font-mono">~/.ssh/config</span> in the real
                app
              </span>
            </label>

            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-[#2e2e2e] bg-[#242424] px-3 py-1.5 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || !host.trim()}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-900 transition-all hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Add project
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function FolderPicker({
  path,
  onPathChange,
  onCancel,
  onBack,
  onOpenFolder,
}: {
  path: string[];
  onPathChange: (p: string[]) => void;
  onCancel: () => void;
  onBack: () => void;
  onOpenFolder: (folderName: string) => void;
}) {
  const columns = useMemo(() => getColumns(HOME_FS, path), [path]);
  const selectedFolder = path.length > 0 ? path[path.length - 1] : null;

  const navigateInColumn = (colIdx: number, node: FsNode) => {
    if (node.kind !== "folder") return;
    const newPath = [...path.slice(0, colIdx), node.name];
    onPathChange(newPath);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a folder"
      className="relative w-[640px] max-w-[calc(100%-2rem)] flex flex-col overflow-hidden rounded-xl border border-[#3a3a3a] bg-[#1f1f1f] shadow-2xl"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#2a2a2a] bg-[#2b2b2b] px-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="ml-3 flex items-center gap-1">
          <button
            type="button"
            onClick={onBack}
            title="Back"
            className="flex h-6 w-6 items-center justify-center rounded text-[#b3b3b3] transition-colors hover:bg-[#3a3a3a] hover:text-white"
          >
            <ChevronLeft size={12} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            disabled
            className="flex h-6 w-6 items-center justify-center rounded text-[#5a5a5a]"
          >
            <ChevronRight size={12} strokeWidth={1.5} />
          </button>
        </div>
        <div className="ml-2 flex items-center gap-1.5 rounded-md bg-[#3a3a3a] px-2 py-1 text-[11px] text-[#e5e5e5]">
          <FilledFolder size={11} />
          <span className="truncate max-w-[140px]">
            {selectedFolder ?? "Home"}
          </span>
          <ChevronDown size={9} strokeWidth={1.5} />
        </div>
        <div className="ml-auto flex w-44 items-center gap-1.5 rounded-md bg-[#3a3a3a] px-2 py-1 text-[11px] text-[#7e7e7e]">
          <Search size={11} strokeWidth={1.5} />
          <span>Search</span>
        </div>
      </div>

      <div className="flex" style={{ height: 340 }}>
        <aside className="w-[140px] shrink-0 overflow-y-auto border-r border-[#2a2a2a] bg-[#262626] py-2">
          <PickerSidebarSection title="Favorites">
            {SIDEBAR_FAVORITES.map((favName) => (
              <PickerSidebarItem
                key={favName}
                label={favName}
                active={path[0] === favName}
                onClick={() => onPathChange([favName])}
              />
            ))}
          </PickerSidebarSection>
          <PickerSidebarSection title="Locations">
            <PickerSidebarItem
              label="iCloud Drive"
              onClick={() => onPathChange([])}
              icon={
                <span
                  className="inline-block w-3 h-3 rounded-full"
                  style={{
                    background: "linear-gradient(135deg,#60a5fa,#2563eb)",
                  }}
                />
              }
            />
            <PickerSidebarItem
              label="user"
              active={path.length === 0}
              onClick={() => onPathChange([])}
              icon={<Home size={12} strokeWidth={1.5} />}
            />
            <PickerSidebarItem
              label="Macintosh HD"
              onClick={() => onPathChange([])}
              icon={
                <svg viewBox="0 0 24 24" width={12} height={12}>
                  <ellipse cx="12" cy="6" rx="8" ry="2.5" fill="#9a9a9a" />
                  <path
                    d="M4 6v12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6"
                    fill="#7e7e7e"
                  />
                </svg>
              }
            />
          </PickerSidebarSection>
          <PickerSidebarSection title="Tags">
            <PickerSidebarItem
              label="Yellow"
              disabled
              icon={
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: "#facc15" }}
                />
              }
            />
          </PickerSidebarSection>
        </aside>

        <div className="flex flex-1 overflow-x-auto">
          {columns.map((items, colIdx) => {
            const selectedInThisCol = path[colIdx];
            return (
              <div
                key={colIdx}
                className="w-[180px] shrink-0 overflow-y-auto border-r border-[#2a2a2a] last:border-r-0"
              >
                {items.length === 0 ? (
                  <div className="px-3 py-4 text-[11px] italic text-[#666]">
                    Empty folder
                  </div>
                ) : (
                  <ul className="py-1">
                    {items.map((node) => {
                      const selected = node.name === selectedInThisCol;
                      const isFolder = node.kind === "folder";
                      return (
                        <li key={node.name}>
                          <button
                            type="button"
                            onClick={() => navigateInColumn(colIdx, node)}
                            disabled={!isFolder}
                            className={`flex w-full items-center gap-1.5 px-2.5 py-[3px] text-left text-[12px] ${rowClassName(selected, isFolder)}`}
                          >
                            {isFolder ? (
                              <FilledFolder size={13} />
                            ) : (
                              <FileIcon
                                size={13}
                                strokeWidth={1.5}
                                color="#9a9a9a"
                              />
                            )}
                            <span className="flex-1 truncate">
                              {node.name}
                            </span>
                            {isFolder && (
                              <span
                                className={
                                  selected ? "text-white" : "text-[#5a5a5a]"
                                }
                              >
                                <ChevronRight size={9} strokeWidth={1.5} />
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#2a2a2a] bg-[#2b2b2b] px-3 py-2.5">
        <div className="text-[10px] text-[#7e7e7e]">
          Demo picker — no real folders are read
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-[#3a3a3a] bg-[#3a3a3a] px-3 py-1 text-[12px] font-medium text-[#d4d4d4] transition-colors hover:bg-[#454545]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => selectedFolder && onOpenFolder(selectedFolder)}
            disabled={!selectedFolder}
            className="rounded-md bg-[#2563eb] px-4 py-1 text-[12px] font-medium text-white transition-colors hover:bg-[#1d4ed8] disabled:cursor-not-allowed disabled:bg-[#1e3a8a] disabled:text-[#9ca3af]"
          >
            Open
          </button>
        </div>
      </div>
    </div>
  );
}

function rowClassName(selected: boolean, isFolder: boolean): string {
  if (selected) return "bg-[#1a6dd9] text-white";
  if (isFolder) return "text-[#e5e5e5] hover:bg-[#2e2e2e]";
  return "cursor-default text-[#7e7e7e]";
}

function PickerSidebarSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-2">
      <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-[#7e7e7e]">
        {title}
      </div>
      <ul>{children}</ul>
    </div>
  );
}

function PickerSidebarItem({
  label,
  active,
  onClick,
  icon,
  disabled,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`flex w-full items-center gap-2 px-3 py-1 text-left text-[12px] ${
          active
            ? "bg-[#1a6dd9] text-white"
            : disabled
              ? "cursor-default text-[#7e7e7e]"
              : "text-[#d4d4d4] hover:bg-[#2e2e2e]"
        }`}
      >
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[#9ab8e5]">
          {icon ?? <FilledFolder size={12} />}
        </span>
        <span className="truncate">{label}</span>
      </button>
    </li>
  );
}
