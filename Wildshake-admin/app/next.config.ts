import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Suppress Turbopack workspace root warning and fix asset serving
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
