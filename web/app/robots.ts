import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/spots/", "/places", "/moments", "/decision"],
        disallow: [
          "/owner/",
          "/auth/",
          "/login",
          "/signup",
          "/verify",
          "/onboarding",
          "/profile",
          "/users/",
          "/messages",
          "/settings",
          "/favorites",
          "/achievements",
          "/notifications",
          "/reviews/new",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
