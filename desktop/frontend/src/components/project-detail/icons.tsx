import { iconProps } from "../icons";

export function PlayIcon() { return <svg {...iconProps} width={12} height={12} fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>; }

export function SpinnerIcon() {
  return (
    <svg {...iconProps} width={12} height={12} strokeWidth={2} className="animate-spin">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

export function ErrorCircleIcon() { return <svg {...iconProps} width={12} height={12} stroke="var(--accent-red)" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>; }
