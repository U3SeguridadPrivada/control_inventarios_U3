/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config, { dev }) => {
    config.resolve.symlinks = false;
    // Disable filesystem cache — readlink fails on exFAT volumes
    config.cache = false;
    return config;
  },
};

module.exports = nextConfig;
