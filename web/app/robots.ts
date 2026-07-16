import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/spots/"],
        disallow: ["/owner/", "/login", "/profile"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
