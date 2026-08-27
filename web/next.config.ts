import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Fully static site: every route prerenders, data ships as JSON in
  // public/, so the build exports plain HTML/JS servable from any host.
  output: "export",
};

export default nextConfig;
