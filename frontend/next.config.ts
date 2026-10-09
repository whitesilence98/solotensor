import type { NextConfig } from "next";

const backendBase =
  process.env.BACKEND_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  /* ComfyUI/MinIO images are plain <img> tags, so no remotePatterns needed. */
  allowedDevOrigins: ["192.168.1.70", "localhost", "127.0.0.1"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendBase}/api/:path*`,
      },
      {
        source: "/files/:path*",
        destination: `${backendBase}/files/:path*`,
      },
    ];
  },
};

export default nextConfig;
