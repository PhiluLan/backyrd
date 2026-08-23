import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@backyrd/shared", "@backyrd/canonical-semantics"],
};

export default nextConfig;
