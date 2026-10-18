import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  async redirects() {
    return [
      { source: "/wallet", destination: "/payment", permanent: false },
      { source: "/wallet/orders", destination: "/orders", permanent: false },
      { source: "/wallet/orders/:id", destination: "/orders/:id", permanent: false },
      { source: "/wallet/request", destination: "/requests", permanent: false },
    ];
  },
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
