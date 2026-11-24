import { locatePath } from "../../locate";
import { joinAbs } from "../../path";
import { openFileViewer } from "../../store/fileViewer";

// Opens a path printed on an SSH project's host, where `files` are the project
// files it can mean. One outside the project, or in it by another spelling of
// its folder (`/home/me/app` for `~/app`), is found by asking the host. Never an
// app of this computer's: the same path here is another file, or none.
export async function openHostPath(
  root: string,
  printed: string,
  files: string[],
  at: { line: number; col: number },
): Promise<void> {
  openFileViewer({
    absPath: files[0] ?? (await hostPath(root, printed)),
    line: at.line,
    col: at.col,
    projectRoot: root,
    onHost: true,
    ...(files.length > 1 ? { choices: files } : {}),
  });
}

// As printed when the host has nothing there or can't be asked, so the viewer
// says which.
async function hostPath(root: string, printed: string): Promise<string> {
  const found = await locatePath(root, printed).catch(() => null);
  if (!found || found.kind === "missing") return printed;
  return found.rel === null ? found.path : joinAbs(root, found.rel, false);
}
