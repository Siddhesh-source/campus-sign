import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every Phase 1 page is per-user and session-dependent; keep rendering fully
  // dynamic instead of Cache Components' static-shell model.
  cacheComponents: false,
  devIndicators: { position: "bottom-right" },
  // Student documents must never end up in a deploy artifact.
  outputFileTracingExcludes: { "/*": ["storage/**/*", ".test-storage/**/*"] },
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
