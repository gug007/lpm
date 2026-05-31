import { Play, FolderOpen } from "lucide-react";
import { PlaySoundPreview, PickAudioFile } from "../../bridge/commands";

const SELECT_CLASS =
  "max-w-[150px] truncate rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)]";

const ICON_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--border)] text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-active)] disabled:opacity-40";

const basename = (p: string) => p.split("/").pop() || p;

export function SoundPicker({
  value,
  sounds,
  event,
  onChange,
}: {
  value: string;
  sounds: string[];
  event: "done" | "waiting" | "error";
  onChange: (value: string) => void;
}) {
  const isPath = value.startsWith("/");
  const silent = value === "none" || value === "";

  // A button, not a <select> option: opening the native dialog from inside a
  // select's change handler deadlocks the WKWebView.
  const chooseFile = async () => {
    const picked = await PickAudioFile();
    if (picked) onChange(picked);
  };

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_CLASS}
        title={isPath ? value : undefined}
      >
        <option value="chime">Chime (default)</option>
        <option value="none">None</option>
        {isPath && <option value={value}>{basename(value)} (file)</option>}
        {sounds.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button type="button" aria-label="Choose audio file" title="Choose audio file" onClick={() => void chooseFile()} className={ICON_BTN}>
        <FolderOpen size={13} />
      </button>
      <button
        type="button"
        aria-label="Preview sound"
        title="Preview"
        disabled={silent}
        onClick={() => void PlaySoundPreview(value, event)}
        className={ICON_BTN}
      >
        <Play size={13} />
      </button>
    </div>
  );
}
