import { useState } from "react";
import { toast } from "../../notifications/toast";

// A setting saved from a Connections row: busy while it goes, and a toast
// titled `errorTitle` when it fails.
export function useSaving(errorTitle: string) {
  const [busy, setBusy] = useState(false);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
    } catch (err) {
      toast.error(errorTitle, { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
