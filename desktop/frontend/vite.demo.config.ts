import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "./vite.config.ts";
import { SOURCE } from "./src/demo/tour/protocol.ts";

function demoEntry(): Plugin {
  return {
    name: "lpm-demo-entry",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replace("/src/main.tsx", "/src/demo/main.ts"),
    },
  };
}

// Reads the app's code through fetch, where the bytes can be counted, then lets
// the entry take it from the HTTP cache. They run one after the other, and the
// code loses its preload tag, so a slow connection never pays for it twice.
function bootScript(entry: string, code: string, bytes: number): string {
  return `<script>
(() => {
  let reported = -1;
  const report = (received) => {
    const percent = Math.min(100, Math.floor((received / ${bytes}) * 100));
    if (percent === reported) return;
    reported = percent;
    parent.postMessage({ source: ${JSON.stringify(SOURCE)}, type: "progress", fraction: percent / 100 }, location.origin);
  };
  const boot = () => {
    const script = document.createElement("script");
    script.type = "module";
    script.crossOrigin = "";
    script.src = ${JSON.stringify(entry)};
    document.head.append(script);
  };
  fetch(${JSON.stringify(code)})
    .then(async (response) => {
      const reader = response.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        received += value.length;
        report(received);
      }
    })
    .catch(() => {})
    .finally(boot);
})();
</script>`;
}

// Build only: the dev server has no bundle to measure.
function demoLoadProgress(): Plugin {
  return {
    name: "lpm-demo-load-progress",
    transformIndexHtml: {
      order: "post",
      handler: (html, { bundle }) => {
        if (!bundle) return html;
        const entry = Object.values(bundle).find((file) => file.type === "chunk" && file.isEntry);
        if (entry?.type !== "chunk") return html;
        const firstLoad = [entry, ...entry.imports.map((name) => bundle[name])].flatMap((file) =>
          file.type === "chunk" ? [{ src: `./${file.fileName}`, bytes: Buffer.byteLength(file.code) }] : [],
        );
        const heaviest = firstLoad.reduce((a, b) => (b.bytes > a.bytes ? b : a));
        const entryTag = `<script type="module" crossorigin src="./${entry.fileName}"></script>`;
        const preloadTag = `<link rel="modulepreload" crossorigin href="${heaviest.src}">`;
        return html
          .replace(preloadTag, "")
          .replace(entryTag, () => bootScript(`./${entry.fileName}`, heaviest.src, heaviest.bytes));
      },
    },
  };
}

export default mergeConfig(
  base,
  defineConfig({
    base: "./",
    server: { port: 9246 },
    plugins: [demoEntry(), demoLoadProgress()],
    build: {
      outDir: "../../website/public/demo-app",
      emptyOutDir: true,
      // src/demo/install has to run before any app module reads Tauri's globals,
      // and chunks shared with lazy code would otherwise run ahead of it.
      rolldownOptions: { output: { strictExecutionOrder: true } },
    },
  }),
);
