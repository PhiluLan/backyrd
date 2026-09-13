import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  transpilePackages: ["@backyrd/canonical-semantics", "@backyrd/world-knowledge-authoring-ui", "@backyrd/world-knowledge-core"],
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
    resolveAlias: {
      "@backyrd/world-knowledge-core": "../packages/world-knowledge-core/dist/index.js",
    },
  },
};

export default nextConfig;
