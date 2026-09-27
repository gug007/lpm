// A dialog with a backdrop owns the keyboard; a floating one (backdrop={false})
// leaves the app behind it live, so its shortcuts keep working.
export function blockingDialogOpen(): boolean {
  return document.querySelector('[data-modal-overlay] [aria-modal="true"]') !== null;
}
