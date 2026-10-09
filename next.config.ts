import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every Phase 1 page is per-user and session-dependent; keep rendering fully
  // dynamic instead of Cache Components' static-shell model.
  cacheComponents: false,
  devIndicators: { position: "bottom-right" },
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
