import type { NextConfig } from "next";
import path from "node:path";

const privateRoutePrefixes = [
  "auth",
  "login",
  "signup",
  "verify",
  "onboarding",
  "profile",
  "users",
  "messages",
  "settings",
  "favorites",
  "achievements",
  "notifications",
  "reviews",
  "search",
  "owner",
];

const nextConfig: NextConfig = {
  agentRules: false,
  transpilePackages: ["@backyrd/shared", "@backyrd/canonical-semantics"],
  turbopack: { root: path.resolve(process.cwd(), "..") },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), payment=(), usb=()",
          },
        ],
      },
      ...privateRoutePrefixes.map((prefix) => ({
        source: `/${prefix}/:path*`,
        headers: [
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
};

export default nextConfig;
