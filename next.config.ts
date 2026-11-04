import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Simple webhook app: Cache Components and partial prefetching disabled
  // so force-dynamic / nodejs route handlers build cleanly on Vercel.
};

export default nextConfig;
