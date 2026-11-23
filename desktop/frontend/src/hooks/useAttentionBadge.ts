import { useEffect } from "react";
import { watchAttentionBadge } from "../attentionBadge";

/** The count of agents that need you, on the app's Dock or taskbar icon. */
export function useAttentionBadge(): void {
  useEffect(() => watchAttentionBadge(), []);
}
