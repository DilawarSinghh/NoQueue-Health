/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // @react-pdf/renderer must run as a native Node dependency inside route handlers
    serverComponentsExternalPackages: ["@react-pdf/renderer"],
  },
};

export default nextConfig;

