import { readFile } from "node:fs/promises";
import { join } from "node:path";

const shot = await readFile(
  join(process.cwd(), "public/og/lpm-app-window.jpg"),
  "base64",
);

// The demo's sample workspace, so a shared link shows the product itself.
export const APP_WINDOW = {
  src: `data:image/jpeg;base64,${shot}`,
  frame: "window",
} as const;
