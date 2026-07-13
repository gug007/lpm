import { RemoteFolderBrowserModal } from "./RemoteFolderBrowserModal";
import { useAppStore } from "../store/app";

// Hosts the remote folder browser for the "Local Folder" add-project flow on a
// peer: choosing a folder adopts it as a project on that Mac. The clone flow
// renders its own browser instance for its destination field.
export function RemoteFolderPickerHost() {
  const target = useAppStore((s) => s.addProjectTarget);
  const open = useAppStore((s) => s.remoteFolderPickerOpen);
  const onClose = useAppStore((s) => s.closeRemoteFolderPicker);
  const onChoose = useAppStore((s) => s.createRemoteProjectFromFolder);

  if (!target) return null;
  return (
    <RemoteFolderBrowserModal
      open={open}
      slug={target.slug}
      alias={target.alias}
      confirmLabel="Add project"
      onChoose={onChoose}
      onClose={onClose}
    />
  );
}
