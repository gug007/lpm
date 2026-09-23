import type { ReactNode } from "react";

type ReplicaWindowProps = {
  title: ReactNode;
  children: ReactNode;
  className?: string;
};

export function ReplicaWindow({ title, children, className = "" }: ReplicaWindowProps) {
  return (
    <div
      aria-hidden="true"
      data-on-dark
      className={`overflow-hidden rounded-xl bg-[#1a1a1a] text-left ring-1 ring-black/10 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] dark:ring-white/[0.12] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)] ${className}`}
    >
      <div className="flex items-center gap-2 border-b border-[#2e2e2e] bg-[#161616] px-3.5 py-2.5">
        <span className="flex w-[52px] shrink-0 gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <span className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-[#b3b3b3]">
          {title}
        </span>
        <span className="w-[52px] shrink-0" />
      </div>
      {children}
    </div>
  );
}
