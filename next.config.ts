import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Framing, plugins, base and form targets locked down. A nonce-based script-src is on TODOS.
  { key: "Content-Security-Policy", value: "frame-ancestors self; object-src none; base-uri self; form-action self" },
  ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Every Phase 1 page is per-user and session-dependent; keep rendering fully
  // dynamic instead of Cache Components' static-shell model.
  cacheComponents: false,
  // Fabric SDK uses gRPC and an optional native HSM module; load it from node_modules at runtime.
  serverExternalPackages: ["@hyperledger/fabric-gateway", "@grpc/grpc-js", "pkcs11js"],
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
