/** @type {import('next').NextConfig} */
const nextConfig = {
  // exceljs se queda fuera del bundle igual que better-sqlite3: trae binarios y
  // carga dinámica que el empaquetado rompe, y solo se usa en el servidor.
  serverExternalPackages: ["better-sqlite3", "exceljs"],
  webpack: (config, { dev }) => {
    config.resolve.symlinks = false;
    // Disable filesystem cache — readlink fails on exFAT volumes
    config.cache = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // El service worker nunca debe quedarse cacheado: si el navegador sirve
        // una copia vieja, la app se queda anclada a una version anterior.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Content-Type", value: "application/manifest+json; charset=utf-8" },
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

module.exports = nextConfig;
