import { toast } from "sonner";
import { OpenPathInDefaultApp } from "../../../bridge/commands";
import { runsWhenOpened } from "../../path";
import { revealInFinder } from "../files/fileActions";

// Hands a clicked path to its default app, except a file Windows would run
// rather than show: a program is shown in File Explorer instead, and a script
// is left for the viewer (false).
export function openInDefaultApp(abs: string): boolean {
  const runs = runsWhenOpened(abs);
  if (runs === "script") return false;
  if (runs === "binary") void revealInFinder(abs);
  else OpenPathInDefaultApp(abs).catch((err) => toast.error(`Open in Default app: ${err}`));
  return true;
}
