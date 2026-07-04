// The composer's placeholder, shared by the live input and its closed-state
// stand-in (ComposerReopenBar) so both always read the same and can't drift.
export function composerPlaceholder(targetLabel: string): string {
  return `Send to ${targetLabel}…`;
}
