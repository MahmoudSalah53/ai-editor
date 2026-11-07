import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // allow opening the dev server from a phone on the same Wi-Fi
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
