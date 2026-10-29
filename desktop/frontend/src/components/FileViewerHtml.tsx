import { useState } from "react";
import { basename } from "../path";
import { useHtmlPreviewSrc } from "./htmlPreview";

interface FileViewerHtmlProps {
  text: string;
  absPath: string;
}

const FRAME = "block h-full w-full border-0 bg-white";

// A page on this machine loads from the preview scheme, so the stylesheets,
// scripts and images beside it load too; one on a paired computer or an SSH
// host renders from its text alone. Either way it runs outside the app's
// origin: an inline page would share it if its sandbox allowed same-origin.
// A change to the file reloads the page.
export function FileViewerHtml({ text, absPath }: FileViewerHtmlProps) {
  const src = useHtmlPreviewSrc(absPath);
  const [rev, setRev] = useState({ text, n: 0 });
  if (rev.text !== text) setRev({ text, n: rev.n + 1 });

  if (src === undefined) return null;
  const title = basename(absPath);
  return src ? (
    <iframe
      key={rev.n}
      src={src}
      title={title}
      sandbox="allow-scripts allow-same-origin allow-forms"
      className={FRAME}
    />
  ) : (
    <iframe srcDoc={text} title={title} sandbox="allow-scripts allow-forms" className={FRAME} />
  );
}
