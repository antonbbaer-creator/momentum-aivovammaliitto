import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ylätason kansiossa on oma package-lock.json (firebase-tools), jonka takia
  // Turbopack päättelee työtilan juuren väärin ilman tätä.
  turbopack: { root: __dirname },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'firebasestorage.googleapis.com' },
      { protocol: 'https', hostname: 'momentum-69262.firebasestorage.app' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
};

export default nextConfig;
