import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Permet à la CI de produire le build dans un répertoire dédié (NEXT_DIST_DIR)
  // sans écraser le répertoire de développement. Par défaut : ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: false,
};

export default nextConfig;
