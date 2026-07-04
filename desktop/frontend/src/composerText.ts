// The composer's placeholder, shared by the live input and its closed-state
// stand-in (ComposerReopenBar) so both always read the same and can't drift.
export function composerPlaceholder(targetLabel: string): string {
  return `Send to ${targetLabel}…`;
}

// Hover dwell before a composer action button reveals its tooltip. Shared across
// the footer buttons so they surface in step and stay tunable from one place.
export const COMPOSER_TOOLTIP_DELAY_MS = 500;
