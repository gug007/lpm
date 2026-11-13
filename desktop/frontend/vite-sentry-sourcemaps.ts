import type { PluginOption } from "vite";

// A crash report's stack points into the minified bundle. A release build that
// is given SENTRY_AUTH_TOKEN (with SENTRY_ORG and SENTRY_PROJECT) uploads its
// source maps so Sentry can show the source instead, and they never ship in the
// app. Every other build loads none of this.
export async function sentrySourceMaps(): Promise<PluginOption> {
  if (!process.env.SENTRY_AUTH_TOKEN) return null;
  const { sentryVitePlugin } = await import("@sentry/vite-plugin");
  return sentryVitePlugin({
    // The name crashreport.rs reports under.
    release: { name: `lpm-desktop@${process.env.LPM_VERSION || "dev"}` },
    // Named here because the plugin's own cleanup misses the workers' maps.
    sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
    telemetry: false,
    // Sentry being down must not fail a release.
    errorHandler: (error) => console.warn(`sentry: source maps were not uploaded: ${error.message}`),
  });
}
