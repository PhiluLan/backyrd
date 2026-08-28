import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";

type SpotRow = { id?: unknown };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.backyrd.ch";
  const staticRoutes: MetadataRoute.Sitemap = [
    ["", "daily", 1],
    ["/places", "daily", 0.9],
    ["/moments", "daily", 0.8],
    ["/decision", "weekly", 0.8],
    ["/legal", "monthly", 0.3],
  ].map(([path, changeFrequency, priority]) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority: Number(priority),
  }));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return staticRoutes;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("distribution_trust_spot_catalog_v1", {
    p_query: null,
    p_city: null,
    p_limit: 500,
    p_surface: "public_web_sitemap",
  });
  if (error || !Array.isArray(data)) return staticRoutes;

  const spots = (data as SpotRow[])
    .map((row) => (typeof row.id === "string" ? row.id : null))
    .filter((id): id is string => Boolean(id))
    .map((id) => ({
      url: `${baseUrl}/spots/${encodeURIComponent(id)}`,
      lastModified: new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

  return [...staticRoutes, ...spots];
}
