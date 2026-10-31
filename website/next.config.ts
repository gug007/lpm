import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // /config was the whole reference on one page. A browser keeps the hash
  // across the redirect, and /docs forwards /config#zones to /docs/zones.
  async redirects() {
    return [{ source: "/config", destination: "/docs", permanent: true }];
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
