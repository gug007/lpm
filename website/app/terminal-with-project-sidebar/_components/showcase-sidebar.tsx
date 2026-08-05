import { Fragment } from "react";
import {
  ChevronDown,
  Folder,
  PanelLeftClose,
  Plus,
  Settings,
  Terminal,
} from "lucide-react";
import {
  FOLDER_MEMBERS,
  FOLDER_NAME,
  TOP_LEVEL,
  projectByKey,
  type ProjectKey,
} from "./walkthrough-data";

const SELECTED: ProjectKey = "checkout";

export function ShowcaseSidebar() {
  return (
    <div className="flex w-[8rem] shrink-0 flex-col border-r border-[#2e2e2e] bg-[#1e1e1e] sm:w-[11rem] lg:w-[13rem]">
      <div className="flex h-9 shrink-0 items-center gap-1.5 px-3 pt-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <PanelLeftClose className="ml-auto h-3.5 w-3.5 text-[#919191]" />
      </div>

      <div className="flex items-center justify-between px-3 pt-1.5 pb-2">
        <span className="text-[10px] font-medium tracking-wider text-[#919191] uppercase">
          Projects
        </span>
        <Plus className="h-3.5 w-3.5 text-[#919191]" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden px-1.5">
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-[#b3b3b3]">
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#8f8f8f]" />
          <Folder className="h-3.5 w-3.5 shrink-0 text-[#8f8f8f]" />
          <span className="min-w-0 truncate">{FOLDER_NAME}</span>
        </div>

        {FOLDER_MEMBERS.map((key) => (
          <Fragment key={key}>
            <Row projectKey={key} indent />
            {key === SELECTED && <DuplicateRow />}
          </Fragment>
        ))}
        {TOP_LEVEL.map((key) => (
          <Row key={key} projectKey={key} />
        ))}
      </div>

      <div className="flex flex-col gap-0.5 p-2">
        <FooterRow icon={<Terminal className="h-3.5 w-3.5" />} label="Terminals" />
        <FooterRow icon={<Settings className="h-3.5 w-3.5" />} label="Settings" />
      </div>
    </div>
  );
}

function Row({
  projectKey,
  indent,
}: {
  projectKey: ProjectKey;
  indent?: boolean;
}) {
  const project = projectByKey(projectKey);
  const selected = projectKey === SELECTED;
  const needsYou = project.agent === "needs-you";

  return (
    <div
      className={`flex items-center gap-2 rounded-md py-1.5 pr-2 text-[13px] ${
        indent ? "pl-5" : "pl-2"
      } ${selected ? "bg-[#333333] text-[#e5e5e5]" : "text-[#b3b3b3]"}`}
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${
          project.run === "running" ? "bg-[#4ade80]" : "border border-[#8f8f8f]"
        }`}
      />
      <span
        className={`min-w-0 flex-1 truncate ${needsYou ? "text-[#f59e0b]" : ""}`}
      >
        {project.name}
      </span>
      {needsYou && (
        <span className="hidden shrink-0 text-[9px] tracking-wide text-[#f59e0b] uppercase lg:inline">
          needs you
        </span>
      )}
    </div>
  );
}

/** A Git worktree of the selected project, sitting under its parent. */
function DuplicateRow() {
  return (
    <div className="flex items-center gap-2 rounded-md py-1.5 pr-2 pl-5 text-[13px]">
      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4ade80]" />
      <span className="min-w-0 flex-1 truncate text-[#8f8f8f]">
        checkout-refunds
      </span>
    </div>
  );
}

function FooterRow({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-1.5 text-[12px] text-[#b3b3b3]">
      <span className="shrink-0 text-[#919191]">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}
