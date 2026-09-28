import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: every route prerenders, data ships as JSON in
  // public/, so the build exports plain HTML/JS servable from any host.
  output: "export",
  // /map/ exports as map/index.html, which every static host serves.
  trailingSlash: true,
};

export default nextConfig;
