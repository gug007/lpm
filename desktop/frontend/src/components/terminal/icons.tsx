import { iconProps } from "../icons";

export function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>; }
export function ArrowDownIcon() { return <svg {...iconProps}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>; }
export function MinusIcon() { return <svg {...iconProps}><path d="M5 12h14" /></svg>; }
export function PlusIcon() { return <svg {...iconProps}><path d="M12 5v14" /><path d="M5 12h14" /></svg>; }
export function ChevronUpIcon() { return <svg {...iconProps}><path d="m18 15-6-6-6 6" /></svg>; }
export function ExpandIcon() { return <svg {...iconProps}><polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" /></svg>; }
export function ShrinkIcon() { return <svg {...iconProps}><polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" /></svg>; }
export function ClearIcon() {
  return (
    <svg {...iconProps}>
      <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" />
      <path d="M22 21H7" />
      <path d="m5 11 9 9" />
    </svg>
  );
}
export function SplitRightIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}
export function SplitDownIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <line x1="3" y1="12" x2="21" y2="12" />
    </svg>
  );
}
