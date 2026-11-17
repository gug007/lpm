import { StatusLineAlert } from "./StatusLineAlert";

export function StatusLineAlerts({
  loadError,
  applyError,
  presetError = false,
  loadMessage = "Couldn’t load your saved status line.",
  applyMessage = "Couldn’t apply this change. Your previous status line is still active.",
  onRetryLoad,
  onRetryPreset,
}: {
  loadError: string | null;
  applyError: string | null;
  presetError?: boolean;
  loadMessage?: string;
  applyMessage?: string;
  onRetryLoad: () => void;
  onRetryPreset?: () => void;
}) {
  if (!loadError && !applyError && !presetError) return null;
  return (
    <div className="min-w-0 space-y-3">
      {loadError && (
        <StatusLineAlert action={{ label: "Retry", onClick: onRetryLoad }}>{loadMessage}</StatusLineAlert>
      )}
      {applyError && <StatusLineAlert details={applyError}>{applyMessage}</StatusLineAlert>}
      {presetError && onRetryPreset && (
        <StatusLineAlert tone="warning" action={{ label: "Retry", onClick: onRetryPreset }}>
          Couldn’t load this preset’s customization controls.
        </StatusLineAlert>
      )}
    </div>
  );
}
