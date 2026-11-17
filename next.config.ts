import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // PDF exports read brand fonts and the logo from disk at runtime; ship them with the server functions.
  outputFileTracingIncludes: {
    "/**": ["./lib/pdf/fonts/*.ttf", "./public/brand/web/logo-master-full.png"],
  },
  experimental: {
    // Import files are sent through a Server Action (limit enforced again in lib/import/sheet.ts: 5 MB).
    serverActions: { bodySizeLimit: "6mb" },
  },
  partialPrefetching: true,
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
