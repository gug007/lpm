import type { ReactNode } from "react";

export type ToastId = string | number;

export type ToastKind = "default" | "success" | "info" | "warning" | "error" | "loading";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** Work done in steps: how many are behind it, out of how many. */
export interface ToastProgress {
  step: number;
  steps: number;
}

/** What a notification is about, for the per-event channels in Settings. */
export type NotificationEvent =
  | "agentWaiting"
  | "agentDone"
  | "agentError"
  | "automation"
  | "autoPull"
  | "peers"
  | "sendLater"
  | "keepAwake";

export interface ToastOptions {
  id?: ToastId;
  description?: ReactNode;
  duration?: number;
  action?: ToastAction;
  cancel?: ToastAction;
  /** More buttons after `action`, for toasts that offer several ways on. */
  actions?: ToastAction[];
  retry?: () => void;
  /** Words worth reading as written: an agent's question, a run's summary. */
  quote?: string;
  /** A short label beside the title, like the project a run belongs to. */
  tag?: string;
  progress?: ToastProgress;
  /** Rows of its own under the text, for toasts that list several things. */
  content?: ReactNode;
  event?: NotificationEvent;
}

export interface ToastModel {
  id: ToastId;
  kind: ToastKind;
  title: ReactNode;
  description?: ReactNode;
  /** Raw output (git's stderr, a stack) folded under Details. */
  details?: string;
  detailsOpen?: boolean;
  quote?: string;
  tag?: string;
  progress?: ToastProgress;
  content?: ReactNode;
  actions: ToastAction[];
  cancel?: ToastAction;
  retry?: () => void;
  event?: NotificationEvent;
  count: number;
  duration: number;
  shownAt: number;
}
