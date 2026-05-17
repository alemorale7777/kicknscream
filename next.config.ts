import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Lock turbopack to this project; user's parent dir has its own lockfile.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Treat Prisma as an external server package so the engine binary doesn't
  // get bundled into RSC chunks.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-neon"],

  images: {
    remotePatterns: [
      // Vercel Blob public uploads
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Google profile photos for OAuth users
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },

  // Security defaults
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
