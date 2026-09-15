import { UploadAndQuoteForTerminal } from "../bridge/commands";
import { isImagePath, quoteImagePathForPaste } from "./composerValue";
import { shellQuote } from "./terminal-io";
import { splitByImageTokens } from "./components/composerEditor";
import { peerSlugOf } from "./peer/markers";

// Resolve a message (its serialized text + token→path image map) into what the
// terminal receives: plain text when there are no images, or an ordered array of
// text runs and per-image bracketed pastes. Each image path is uploaded (scp'd)
// for a remote pane and passed through for a local one, kept in segment order
// and padded so a path-attaching agent keeps order; blank runs between chips are
// dropped. A literal "[Image #N]" the user typed (no mapped path) rides along as
// plain text.
//
// Resolved against the terminal it is going TO, never the one it came from: the
// upload has to land on that pane's host, so a prompt sent across projects is
// composed for its target.
export async function buildTerminalPayload(
  terminalId: string,
  text: string,
  images: Record<string, string>,
): Promise<string | string[]> {
  const segments = splitByImageTokens(text);
  const hasImages = segments.some((s) => s.image !== null && images[s.image] !== undefined);
  if (!hasImages) return text;
  const isRemotePeer = peerSlugOf(terminalId) !== null;
  const parts = await Promise.all(
    segments.map(async (s) => {
      const path = s.image === null ? undefined : images[s.image];
      if (path === undefined) return s.text;
      // For a peer terminal the path is already host-valid — the host wrote the
      // file when the chip was attached — so there is nothing to upload here,
      // only the same paste formatting the host would have applied.
      if (isRemotePeer) {
        return ` ${isImagePath(path) ? quoteImagePathForPaste(path) : shellQuote(path)} `;
      }
      const uploaded = await UploadAndQuoteForTerminal(terminalId, [path]).catch(() => "");
      return ` ${uploaded || quoteImagePathForPaste(path)} `;
    }),
  );
  return parts.filter((p) => p.trim().length > 0);
}
