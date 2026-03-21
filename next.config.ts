import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jsnfhksxwohptkysdkii.supabase.co',
      },
    ],
  },
};

export default nextConfig;
