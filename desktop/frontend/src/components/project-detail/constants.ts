import type { ServiceInfo } from "../../types";

// Stable empty array for `services` so TerminalView's prop equality
// doesn't churn when the project isn't running.
export const EMPTY_SERVICES: ServiceInfo[] = [];

export const noop = () => {};

// The unannotated header is forwarded to the OS for window dragging.
// Anything inside the header that should accept its own clicks must
// opt out of that behavior.
export const NO_DRAG_STYLE = { "--app-draggable": "no-drag" } as React.CSSProperties;
