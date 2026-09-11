import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@backyrd/canonical-semantics", "@backyrd/world-knowledge-authoring-ui", "@backyrd/world-knowledge-core"],
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
