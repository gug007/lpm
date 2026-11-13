import type { NextConfig } from "next";
import { APP_STORE_URL, PLAY_STORE_URL, STORE_LINK_PATH } from "./lib/links";

const nextConfig: NextConfig = {
  // /config was the whole reference on one page. A browser keeps the hash
  // across the redirect, and /docs forwards /config#zones to /docs/zones.
  async redirects() {
    return [
      { source: "/config", destination: "/docs", permanent: true },
      {
        source: STORE_LINK_PATH,
        has: [{ type: "header", key: "user-agent", value: ".*Android.*" }],
        destination: PLAY_STORE_URL,
        permanent: false,
      },
      { source: STORE_LINK_PATH, destination: APP_STORE_URL, permanent: false },
    ];
  },
  // Vite names these after their contents, so a repeat visit can skip asking.
  async headers() {
    return [
      {
        source: "/demo-app/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
  images: {
    qualities: [75, 90],
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
    ],
  },
};

export default nextConfig;
