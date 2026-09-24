import {
  File,
  FileCode,
  FileText,
  Folder,
  FolderGit2,
  GitBranch,
  KeyRound,
  Package,
  type LucideIcon,
} from "lucide-react";
import FolderStatus from "./folder-status";
import type { ItemCell, ItemKind } from "./explorer-data";

const KIND_ICON: Record<ItemKind, LucideIcon> = {
  repo: FolderGit2,
  pointer: File,
  branch: GitBranch,
  code: FileCode,
  text: FileText,
  secret: KeyRound,
  package: Package,
  folder: Folder,
};

const GUIDE =
  "before:absolute before:left-0 before:top-0 before:w-px before:bg-gray-200 dark:before:bg-gray-700/70 before:bottom-0 last:before:bottom-auto last:before:h-[19px] after:absolute after:left-0 after:top-[19px] after:h-px after:w-2.5 after:bg-gray-200 dark:after:bg-gray-700/70";

export default function FolderRow({
  name,
  kind,
  tag,
  cell,
  flash,
  flashTint,
}: {
  name: string;
  kind: ItemKind;
  tag?: string;
  cell: ItemCell;
  flash?: number;
  flashTint: string;
}) {
  const Icon = KIND_ICON[cell.kind ?? kind];
  const missing = cell.state === "missing";
  const changed = flash !== undefined;
  return (
    <li className={`relative flex min-w-0 gap-2.5 py-2 pl-4 pr-4 sm:pr-5 ${GUIDE}`}>
      {changed && (
        <span
          key={flash}
          aria-hidden
          className={`pointer-events-none absolute inset-y-0.5 left-2 right-2 rounded-lg opacity-0 transition-opacity duration-[1400ms] ease-out starting:opacity-100 motion-reduce:hidden ${flashTint}`}
        />
      )}
      <span className="relative mt-px">
        <FolderStatus key={cell.state} state={cell.state} pop={changed} />
      </span>
      <div className="relative min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <Icon
            aria-hidden
            className={`h-3.5 w-3.5 shrink-0 transition-colors duration-300 motion-reduce:transition-none ${
              missing ? "text-gray-400 dark:text-gray-500" : "text-gray-500 dark:text-gray-400"
            }`}
          />
          <code
            className={`font-mono text-[13px] leading-5 line-through transition-[color,text-decoration-color] duration-300 motion-reduce:transition-none ${
              missing
                ? "text-gray-500 decoration-gray-500/80 dark:text-gray-400 dark:decoration-gray-400/80"
                : "text-gray-900 decoration-transparent forced-colors:no-underline dark:text-gray-100"
            }`}
          >
            {cell.name ?? name}
          </code>
          {tag && (
            <span className="rounded-md bg-gray-100 px-1.5 py-px text-[10.5px] font-medium leading-4 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400">
              {tag}
            </span>
          )}
        </div>
        <p
          key={cell.reason}
          className={`mt-0.5 text-xs leading-snug text-gray-500 dark:text-gray-400${
            changed
              ? " transition-opacity duration-300 starting:opacity-0 motion-reduce:transition-none"
              : ""
          }`}
        >
          {cell.reason}
        </p>
      </div>
    </li>
  );
}
