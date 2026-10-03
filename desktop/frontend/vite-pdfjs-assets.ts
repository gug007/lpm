import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

// What the PDF worker fetches on demand: fonts a PDF names but doesn't embed,
// CJK character maps, and the image decoders. Scripting (quickjs) stays out;
// the viewer never runs a document's JavaScript.
const DIRS = ["standard_fonts", "cmaps", "wasm", "iccs"];
const SKIP = /^quickjs-eval\./;

const root = path.dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

function assets(): string[] {
  return DIRS.flatMap((dir) =>
    fs
      .readdirSync(path.join(root, dir))
      .filter((name) => !SKIP.test(name))
      .map((name) => `${dir}/${name}`),
  );
}

// The decoders' JavaScript fallbacks are imported, so they need a script type.
function contentType(rel: string): string {
  if (rel.endsWith(".wasm")) return "application/wasm";
  if (rel.endsWith(".js")) return "text/javascript";
  return "application/octet-stream";
}

// Serves them at /pdfjs/ in dev and copies them there in a build.
export function pdfjsAssets(): Plugin {
  return {
    name: "pdfjs-assets",
    configureServer(server) {
      const known = new Set(assets());
      server.middlewares.use("/pdfjs", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "").split("?")[0]).replace(/^\/+/, "");
        if (!known.has(rel)) return next();
        res.setHeader("Content-Type", contentType(rel));
        fs.createReadStream(path.join(root, rel))
          .on("error", () => next())
          .pipe(res);
      });
    },
    generateBundle() {
      for (const rel of assets()) {
        this.emitFile({ type: "asset", fileName: `pdfjs/${rel}`, source: fs.readFileSync(path.join(root, rel)) });
      }
    },
  };
}
