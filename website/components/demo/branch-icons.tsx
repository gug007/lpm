const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BranchIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

export function CloudBranchIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6 6 0 0 0-11.6 2.28A4 4 0 0 0 6 19h11.5z" />
    </svg>
  );
}

export function CopyIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

export function PencilIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size}>
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </svg>
  );
}

export function TrashIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size}>
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

export function CheckIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export function PlusIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function ChevronDownIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CommitIcon() {
  return (
    <svg {...ICON_PROPS} width={12} height={12} strokeWidth={2}>
      <circle cx="12" cy="12" r="3" />
      <line x1="3" y1="12" x2="9" y2="12" />
      <line x1="15" y1="12" x2="21" y2="12" />
    </svg>
  );
}

export function CloudOffIcon({ size = 12 }: { size?: number } = {}) {
  return (
    <svg {...ICON_PROPS} width={size} height={size} strokeWidth={2}>
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
      <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
    </svg>
  );
}

export function SyncIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg
      {...ICON_PROPS}
      width={12}
      height={12}
      strokeWidth={2}
      className={spinning ? "animate-spin" : undefined}
    >
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}
