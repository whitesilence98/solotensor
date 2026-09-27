import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ComfyUI/MinIO images are plain <img> tags, so no remotePatterns needed. */
  allowedDevOrigins: ["192.168.1.70"],
};

export default nextConfig;
