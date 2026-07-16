import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Backyrd",
    short_name: "Backyrd",
    description: "Orte nach Gefühl. Nicht nur nach Sternen.",
    start_url: "/",
    display: "standalone",
    background_color: "#070708",
    theme_color: "#070708",
    lang: "de-CH",
  };
}
