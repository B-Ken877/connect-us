import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Permet à la CI de produire le build dans un répertoire dédié (NEXT_DIST_DIR)
  // sans écraser le répertoire de développement. Par défaut : ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: false,
  // ---- UNITED Research — empêcher le cache navigateur ----
  // Les pages sont dynamiques (auth, shifts, IP) — ne JAMAIS les cacher côté
  // navigateur. Sans ces headers, un navigateur normal peut servir une vieille
  // version HTML/JS après un nouveau déploiement Vercel, ce qui cassait la
  // connexion en mode normal (mais pas en incognito qui n'a pas de cache).
  async headers() {
    return [
      {
        // Toutes les routes : pas de cache navigateur
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          { key: "Pragma", value: "no-cache" },
          { key: "Expires", value: "0" },
        ],
      },
    ];
  },
};

export default nextConfig;
