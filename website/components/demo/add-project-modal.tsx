"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NO_AUTOFILL } from "./no-autofill";
import { FOCUS_RING, PRESS } from "./ui";
import {
  DialogHeader,
  DialogPanel,
  MenuCloseButton,
  FIELD_CLASS,
  FieldLabel,
  HelpText,
  PrimaryButton,
  SecondaryButton,
} from "./ui-kit";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
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

export type NewProjectKind = "local" | "ssh" | "clone";

export type NewProjectInput = {
  kind: NewProjectKind;
  name: string;
  host?: string;
  url?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
};

type Phase = "pick" | "local" | "ssh" | "clone" | "template";

type Template = {
  id: string;
  icon: string;
  label: string;
  desc: string;
  project: string;
};

const TEMPLATES: Template[] = [
  {
    id: "nextjs",
    icon: "▲",
    label: "Next.js",
    desc: "App Router, TypeScript, and Tailwind CSS",
    project: "nextjs-app",
  },
  {
    id: "vite-react",
    icon: "⚡",
    label: "Vite + React",
    desc: "Fast single-page app starter",
    project: "vite-app",
  },
  {
    id: "go-service",
    icon: "🐹",
    label: "Go service",
    desc: "HTTP service with a sensible layout",
    project: "go-service",
  },
  {
    id: "fastapi",
    icon: "🐍",
    label: "FastAPI",
    desc: "Python API with uvicorn reload",
    project: "fastapi-app",
  },
];

const DEST_FOLDERS = ["~/Projects", "~/Code", "~/dev", "~/work"];

function deriveNameFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  let tail = trimmed.replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
  tail = tail.replace(/\.git$/i, "");
  return tail
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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
  const [user, setUser] = useState("");
  const [port, setPort] = useState("");
  const [url, setUrl] = useState("");
  const [branch, setBranch] = useState("");
  const [dest, setDest] = useState(DEST_FOLDERS[0]);
  const [destMenuOpen, setDestMenuOpen] = useState(false);
  const [nameEdited, setNameEdited] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [path, setPath] = useState<string[]>(["Projects"]);
  const sshNameRef = useRef<HTMLInputElement>(null);
  const cloneUrlRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setPhase("pick");
    setName("");
    setHost("");
    setUser("");
    setPort("");
    setUrl("");
    setBranch("");
    setDest(DEST_FOLDERS[0]);
    setDestMenuOpen(false);
    setNameEdited(false);
    setShowAdvanced(false);
    setPath(["Projects"]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (phase === "ssh") sshNameRef.current?.focus();
    if (phase === "clone") cloneUrlRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!open) return null;

  const submitSsh = () => {
    const trimmed = name.trim();
    const h = host.trim();
    if (!trimmed || !h) return;
    onCreate({ kind: "ssh", name: trimmed, host: h });
    reset();
  };

  const cloneName = nameEdited ? name : deriveNameFromUrl(url);

  const submitClone = () => {
    const trimmed = cloneName.trim();
    const u = url.trim();
    if (!trimmed || !u) return;
    onCreate({ kind: "clone", name: trimmed, url: u });
    reset();
  };

  const handleOpenFolder = (folderName: string) => {
    onCreate({ kind: "local", name: folderName });
    reset();
  };

  const handlePickTemplate = (template: Template) => {
    onCreate({ kind: "local", name: template.project });
    reset();
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        onClick={handleClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
      />

      {phase === "pick" && (
        <div
          role="dialog"
          aria-labelledby="add-project-title"
          className="relative w-[360px] overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] py-1.5 shadow-2xl"
        >
          <MenuCloseButton onClick={handleClose} />
          <div className="px-2 pb-1 pt-3.5">
            <h3
              id="add-project-title"
              className="px-4 text-[13px] font-medium text-[#e5e5e5]"
            >
              Add a project
            </h3>
            <div className="mt-3 flex flex-col">
              <SourceOption
                icon={<Folder size={22} strokeWidth={1.5} />}
                color="#facc15"
                label="Local Folder"
                desc="A project on this machine — pick a folder on disk"
                onClick={() => setPhase("local")}
              />
              <SourceOption
                icon={<Cloud size={22} strokeWidth={1.5} />}
                color="#a78bfa"
                label="Clone Repository"
                desc="Clone from a Git repo URL into a local folder"
                onClick={() => setPhase("clone")}
              />
              <SourceOption
                icon={<Server size={22} strokeWidth={1.5} />}
                color="#22d3ee"
                label="SSH Host"
                desc="Connect to a remote machine over SSH"
                onClick={() => setPhase("ssh")}
              />
              <button
                type="button"
                onClick={() => setPhase("template")}
                className={`group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[#2a2a2a] ${FOCUS_RING}`}
              >
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2a] text-[19px] leading-none transition-colors group-hover:bg-[#333333]">
                  ✨
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="text-[13px] font-medium text-[#e5e5e5]">
                    From template
                  </div>
                  <div className="mt-0.5 text-[11px] leading-relaxed text-[#b3b3b3]">
                    Create a new project from a template
                  </div>
                </div>
                <span className="mt-2 flex shrink-0 text-[#919191]">
                  <ChevronRight size={14} strokeWidth={1.5} />
                </span>
              </button>
            </div>
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
        <DialogPanel
          className="relative max-w-[calc(100%-2rem)]"
          aria-label="Connect to SSH host"
        >
          <BackButton onClick={() => setPhase("pick")} />
          <DialogHeader
            title="Connect to SSH host"
            description="Creates a project that connects to a remote host. Services, actions, and terminals will run over this SSH connection."
            onClose={handleClose}
          />

          <form
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              submitSsh();
            }}
          >
            <div className="mt-4 grid grid-cols-[1fr_120px] gap-3">
              <div className="col-span-2">
                <FieldLabel>Host</FieldLabel>
                <input
                  ref={sshNameRef}
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="example.com or 10.0.0.5"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <FieldLabel>User</FieldLabel>
                <input
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  placeholder="root"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <FieldLabel>Port</FieldLabel>
                <input
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  placeholder="22"
                  inputMode="numeric"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div className="col-span-2">
                <FieldLabel>Project name</FieldLabel>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-server"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton onClick={handleClose}>Cancel</SecondaryButton>
              <PrimaryButton
                type="submit"
                disabled={!name.trim() || !host.trim()}
              >
                Add project
              </PrimaryButton>
            </div>
          </form>
        </DialogPanel>
      )}

      {phase === "clone" && (
        <DialogPanel
          className="relative max-w-[calc(100%-2rem)]"
          aria-label="Clone repository"
        >
          <BackButton onClick={() => setPhase("pick")} />
          <DialogHeader
            title="Clone repository"
            description="Clones a Git repo into a folder on this machine and adds it as a project."
            onClose={handleClose}
          />

          <form
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              submitClone();
            }}
          >
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div>
                <FieldLabel>Repository URL</FieldLabel>
                <input
                  ref={cloneUrlRef}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo.git"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
                <HelpText>
                  HTTPS or SSH URL. Uses your existing Git credentials.
                </HelpText>
              </div>

              <div>
                <FieldLabel>Destination folder</FieldLabel>
                <div className="relative grid grid-cols-[1fr_auto] gap-2">
                  <input readOnly value={dest} className={FIELD_CLASS} />
                  <button
                    type="button"
                    onClick={() => setDestMenuOpen((v) => !v)}
                    className={`shrink-0 rounded-md border border-[#2e2e2e] px-3 py-2 text-xs font-medium text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS}`}
                  >
                    Choose…
                  </button>
                  {destMenuOpen && (
                    <div
                      className="switcher-in absolute right-0 top-full z-10 mt-1 min-w-[180px] origin-top-right overflow-hidden rounded-lg border border-[#2e2e2e] bg-[#1a1a1a] py-1 shadow-lg"
                      onMouseLeave={() => setDestMenuOpen(false)}
                    >
                      {DEST_FOLDERS.map((folder) => (
                        <button
                          key={folder}
                          type="button"
                          onClick={() => {
                            setDest(folder);
                            setDestMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] text-[#b3b3b3] transition-colors hover:bg-[#2a2a2a] hover:text-[#e5e5e5]"
                        >
                          <FilledFolder size={12} />
                          {folder}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <HelpText>
                  Repository will be cloned into a new subfolder here.
                </HelpText>
              </div>

              <div>
                <FieldLabel>Project name</FieldLabel>
                <input
                  value={cloneName}
                  onChange={(e) => {
                    setNameEdited(true);
                    setName(e.target.value);
                  }}
                  placeholder="my-repo"
                  {...NO_AUTOFILL}
                  className={FIELD_CLASS}
                />
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  aria-expanded={showAdvanced}
                  className={`inline-flex items-center gap-1 rounded text-[11px] font-medium text-[#919191] transition-colors hover:text-[#b3b3b3] ${FOCUS_RING}`}
                >
                  <span
                    className={`inline-block transition-transform ${showAdvanced ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                  Advanced
                </button>
                {showAdvanced && (
                  <div className="mt-2">
                    <FieldLabel>
                      Branch{" "}
                      <span className="font-normal text-[#919191]">
                        (optional)
                      </span>
                    </FieldLabel>
                    <input
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      placeholder="main"
                      {...NO_AUTOFILL}
                      className={FIELD_CLASS}
                    />
                    <HelpText>
                      Leave blank to use the repository&apos;s default branch.
                    </HelpText>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <SecondaryButton onClick={handleClose}>Cancel</SecondaryButton>
              <PrimaryButton
                type="submit"
                disabled={!cloneName.trim() || !url.trim()}
              >
                Clone repository
              </PrimaryButton>
            </div>
          </form>
        </DialogPanel>
      )}

      {phase === "template" && (
        <div
          role="dialog"
          aria-label="New from template"
          className="relative w-[420px] max-w-[calc(100%-2rem)] overflow-hidden rounded-2xl border border-[#2e2e2e] bg-[#1a1a1a] py-1.5 shadow-2xl"
        >
          <MenuCloseButton onClick={handleClose} />
          <button
            type="button"
            onClick={() => setPhase("pick")}
            className={`mx-2 mb-1 flex items-center gap-1 rounded-lg py-1 pl-1 pr-2.5 text-left transition-colors hover:bg-[#2a2a2a] ${FOCUS_RING}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#b3b3b3]">
              <ChevronLeft size={14} strokeWidth={1.5} />
            </span>
            <span className="min-w-0 truncate text-[12.5px] font-medium text-[#e5e5e5]">
              New from template
            </span>
          </button>
          <div className="flex flex-col px-2 pb-1">
            {TEMPLATES.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => handlePickTemplate(template)}
                className={`group flex items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all hover:bg-[#2a2a2a] ${FOCUS_RING}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#242424] text-[15px] leading-none transition-colors group-hover:bg-[#333333]">
                  {template.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[#e5e5e5]">
                    {template.label}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#b3b3b3]">
                    {template.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-3 flex items-center gap-1 rounded text-[11px] text-[#919191] transition-colors hover:text-[#e5e5e5] ${FOCUS_RING} ${PRESS}`}
    >
      <ChevronLeft size={14} strokeWidth={1.5} />
      Back
    </button>
  );
}

function SourceOption({
  icon,
  color,
  label,
  desc,
  onClick,
}: {
  icon: ReactNode;
  color: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-start gap-3.5 rounded-xl px-4 py-3.5 text-left transition-all hover:bg-[#2a2a2a] ${FOCUS_RING}`}
    >
      <div
        className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#2a2a2a] transition-colors group-hover:bg-[#333333]"
        style={{ color }}
      >
        {icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="text-[13px] font-medium text-[#e5e5e5]">{label}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-[#b3b3b3]">
          {desc}
        </div>
      </div>
    </button>
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
                  <div className="px-3 py-4 text-[11px] italic text-[#8a8a8a]">
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
