"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Action } from "./types";

export function SplitButton({
  action,
  onRun,
}: {
  action: Action;
  onRun: (a: Action) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasCmd = !!action.cmd;

  const runChild = (child: Action) => {
    setOpen(false);
    onRun(child);
  };

  if (!hasCmd) {
    return (
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-gray-200 dark:border-gray-800 px-3.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 transition-all hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
        >
          {action.label}
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <ChildMenu
            items={action.children}
            onRun={runChild}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative shrink-0">
      <div className="inline-flex items-stretch rounded-lg border border-gray-200 dark:border-gray-800">
        <button
          type="button"
          onClick={() => onRun(action)}
          className="whitespace-nowrap rounded-l-lg px-3.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 transition-all hover:bg-gray-50 dark:hover:bg-gray-900 hover:text-gray-900 dark:hover:text-white"
        >
          {action.label}
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex items-center rounded-r-lg border-l border-gray-200 dark:border-gray-800 px-1.5 transition-all ${
            open
              ? "bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white"
              : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900"
          }`}
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>
      {open && (
        <ChildMenu
          items={action.children}
          onRun={runChild}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function ChildMenu({
  items,
  onRun,
  onClose,
}: {
  items: Action[];
  onRun: (a: Action) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 py-1 shadow-lg"
      onMouseLeave={onClose}
    >
      {items.length === 0 ? (
        <div className="px-3 py-1.5 text-[11px] text-gray-400 dark:text-gray-500 italic">
          No children
        </div>
      ) : (
        items.map((child) => (
          <button
            key={child.key}
            type="button"
            onClick={() => onRun(child)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] text-gray-600 dark:text-gray-300 transition-colors hover:bg-gray-50 dark:hover:bg-gray-900"
          >
            <span className="flex-1 truncate">{child.label}</span>
          </button>
        ))
      )}
    </div>
  );
}
