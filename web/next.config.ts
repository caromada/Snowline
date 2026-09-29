import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: every route prerenders, data ships as JSON in
  // public/, so the build exports plain HTML/JS servable from any host.
  output: "export",
  // /map/ exports as map/index.html, which every static host serves.
  trailingSlash: true,
  // The account menu reads its limits from supabase/functions/_shared, one
  // directory above web/. Neither bundler resolves files outside its root
  // unless told to.
  turbopack: { root: path.join(__dirname, "..") },
  experimental: { externalDir: true },
};

export default nextConfig;
