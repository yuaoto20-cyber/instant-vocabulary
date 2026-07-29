import type { NextConfig } from "next";

// Set by the Pages workflow. Keep this empty for a user site
// (<owner>.github.io) and for local development.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true
  },
  turbopack: {
    root: __dirname
  }
};

export default nextConfig;
