import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";
import { palette } from "@/lib/theme";

// Required for the static export: the manifest is generated once at build.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description:
      "Mountain pass conditions for Washington, Oregon and California, with honest confidence.",
    start_url: "/map/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: palette.deepPine,
    theme_color: palette.deepPine,
    categories: ["travel", "sports", "weather", "navigation"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
