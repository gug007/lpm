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
export function SearchIcon() { return <svg {...iconProps}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>; }
export function SidebarIcon() { return <svg {...iconProps} viewBox="0 0 22 16" width={18} height={14} strokeWidth={1.6}><rect x="1" y="1" width="20" height="14" rx="2.5" /><line x1="8" y1="1" x2="8" y2="15" /></svg>; }
export function TrashIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>; }
export function UndoIcon() { return <svg {...iconProps}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.7 2.7L3 13" /></svg>; }
export function RefreshIcon() { return <svg {...iconProps}><polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg>; }
export function GlobeIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>; }
export function SunIcon() { return <svg {...iconProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></svg>; }
export function MoonIcon() { return <svg {...iconProps}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>; }
export function TerminalIcon() { return <svg {...iconProps}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="m7 10 2.5 2-2.5 2" /><line x1="12.5" y1="14" x2="16" y2="14" /></svg>; }
export function ChevronLeftIcon() { return <svg {...iconProps}><polyline points="15 18 9 12 15 6" /></svg>; }
export function ChevronRightIcon() { return <svg {...iconProps}><polyline points="9 18 15 12 9 6" /></svg>; }
export function ChevronDownIcon() { return <svg {...iconProps}><path d="m6 9 6 6 6-6" /></svg>; }
export function ChevronUpIcon() { return <svg {...iconProps}><path d="m6 15 6-6 6 6" /></svg>; }
export function MoveIcon() { return <svg {...iconProps}><polyline points="5 9 2 12 5 15" /><polyline points="9 5 12 2 15 5" /><polyline points="15 19 12 22 9 19" /><polyline points="19 9 22 12 19 15" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="2" x2="12" y2="22" /></svg>; }
export function SettingsIcon() { return <svg {...iconProps}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>; }
export function PencilIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" /></svg>; }
export function CheckIcon() { return <svg {...iconProps} width={12} height={12} strokeWidth={2}><polyline points="20 6 9 17 4 12" /></svg>; }
export function CheckSquareIcon() { return <svg {...iconProps}><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>; }
export function PlayIcon() { return <svg {...iconProps} fill="currentColor" stroke="none"><path d="M6 4v16l14-8z" /></svg>; }
export function SparkleIcon() { return <svg {...iconProps}><path d="M9.9 15.5A2 2 0 0 0 8.5 14.1l-6.1-1.6a.5.5 0 0 1 0-1L8.5 9.9A2 2 0 0 0 9.9 8.5l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1A2 2 0 0 0 15.5 9.9l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/></svg>; }
export function StopIcon() { return <svg {...iconProps} fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>; }
export function MenuIcon() { return <svg {...iconProps}><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>; }
export function BranchIcon({ size = 14 }: { size?: number }) { return <svg {...iconProps} width={size} height={size} strokeWidth={2}><line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" /></svg>; }
export function CloudBranchIcon({ size = 14 }: { size?: number }) { return <svg {...iconProps} width={size} height={size} strokeWidth={2}><path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.78 6 6 0 0 0-11.6 2.28A4 4 0 0 0 6 19h11.5z" /></svg>; }
export function CloudOffIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size} strokeWidth={2}><path d="m2 2 20 20" /><path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" /><path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" /></svg>; }
export function FolderIcon() { return <svg {...iconProps}><path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" /></svg>; }
export function ServerIcon() { return <svg {...iconProps}><rect x="2" y="3" width="20" height="8" rx="2" /><rect x="2" y="13" width="20" height="8" rx="2" /><line x1="6" y1="7" x2="6.01" y2="7" /><line x1="6" y1="17" x2="6.01" y2="17" /></svg>; }
export function PRIcon() { return <svg {...iconProps} strokeWidth={2}><circle cx="18" cy="18" r="3" /><circle cx="6" cy="6" r="3" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><line x1="6" y1="9" x2="6" y2="21" /></svg>; }
export function AlertCircleIcon() { return <svg {...iconProps} width={20} height={20} strokeWidth={2}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>; }
export function BellIcon({ filled }: { filled?: boolean } = {}) { return <svg {...iconProps} width={14} height={14} strokeWidth={2} fill={filled ? "currentColor" : "none"}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>; }
export function PlusIcon() { return <svg {...iconProps}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>; }
export function ZapIcon() { return <svg {...iconProps}><path d="M13 2 3 14h9l-1 10 10-12h-9l1-10z" /></svg>; }
export function HelpCircleIcon() { return <svg {...iconProps} strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>; }
export function SmileIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><line x1="9" y1="9" x2="9.01" y2="9" /><line x1="15" y1="9" x2="15.01" y2="9" /></svg>; }
export function CodeIcon() { return <svg {...iconProps}><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>; }
export function LayersIcon() { return <svg {...iconProps}><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m2 12 8.58 3.91a2 2 0 0 0 1.66 0L21 12" /><path d="m2 17 8.58 3.91a2 2 0 0 0 1.66 0L21 17" /></svg>; }
export function CopyIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>; }
export function ClipboardIcon() { return <svg {...iconProps}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></svg>; }
export function ClipboardListIcon() { return <svg {...iconProps}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></svg>; }
export function MessageIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
export function ImageIcon({ size = 13 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="9" cy="9" r="1.6" /><path d="m21 15-5-5L7 21" /></svg>; }
export function FileIcon({ size = 13 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>; }
export function PaperclipIcon() { return <svg {...iconProps}><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>; }
export function SendIcon() { return <svg {...iconProps}><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4z" /></svg>; }
export function ComposerIcon() { return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>; }
export function MicIcon() { return <svg {...iconProps}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>; }
export function DownloadIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>; }
export function UploadIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>; }
export function GitCommitIcon({ size = 14 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size} strokeWidth={2}><circle cx="12" cy="12" r="3" /><line x1="3" y1="12" x2="9" y2="12" /><line x1="15" y1="12" x2="21" y2="12" /></svg>; }
export function PortForwardIcon() { return <svg {...iconProps}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /><circle cx="5" cy="12" r="1" /></svg>; }
export function HistoryIcon() { return <svg {...iconProps}><path d="M3 3v5h5" /><path d="M3.05 13a9 9 0 1 0 .49-4.36L3 8" /><path d="M12 7v5l3 2" /></svg>; }
export function StarIcon({ filled = false, size = 14 }: { filled?: boolean; size?: number } = {}) { return <svg {...iconProps} width={size} height={size} fill={filled ? "currentColor" : "none"}><path d="M11.48 3.5a.6.6 0 0 1 1.04 0l2.28 4.62a.6.6 0 0 0 .45.33l5.1.74a.6.6 0 0 1 .33 1.02l-3.69 3.6a.6.6 0 0 0-.17.53l.87 5.08a.6.6 0 0 1-.87.63l-4.56-2.4a.6.6 0 0 0-.56 0l-4.56 2.4a.6.6 0 0 1-.87-.63l.87-5.08a.6.6 0 0 0-.17-.53l-3.69-3.6a.6.6 0 0 1 .33-1.02l5.1-.74a.6.6 0 0 0 .45-.33z" /></svg>; }
export function MoreVerticalIcon() { return <svg {...iconProps} fill="currentColor" stroke="none"><circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" /></svg>; }
export function DetachIcon({ size = 12 }: { size?: number } = {}) { return <svg {...iconProps} width={size} height={size}><path d="M14 3h7v7" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></svg>; }
