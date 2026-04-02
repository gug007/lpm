export const iconProps = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function XIcon() { return <svg {...iconProps}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>; }
export function SidebarIcon() { return <svg {...iconProps} strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>; }
