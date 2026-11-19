import { OpenPathInDefaultApp } from "../../../bridge/commands";
import { toast } from "../../notifications/toast";
import { shortPath } from "../../toolkit";
import { SettingsRow } from "../SettingsRow";
import { BTN_SECONDARY } from "../ui/buttons";

export function VideoFolderRow({ dir }: { dir: string | null }) {
  const open = () => {
    if (!dir) return;
    OpenPathInDefaultApp(dir).catch((err: unknown) =>
      toast.error("Couldn't open the videos folder", { description: String(err) }),
    );
  };
  return (
    <SettingsRow label="Videos" description={dir ? shortPath(dir) : "No videos yet"}>
      {dir && (
        <button type="button" onClick={open} className={BTN_SECONDARY}>
          Show in Finder
        </button>
      )}
    </SettingsRow>
  );
}
