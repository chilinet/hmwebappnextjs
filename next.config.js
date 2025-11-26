/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 'appDir' entfernen, da es nicht mehr benötigt wird
  },
  output: 'standalone',
  // Disable telemetry during build
  // telemetry: false, // This option is not valid in Next.js 14
  // Image optimization configuration
  images: {
    // In production, ensure images are served correctly
    unoptimized: false,
    // Allow images from the same origin
    domains: [],
    // Ensure public assets are accessible
    formats: ['image/avif', 'image/webp'],
  },
}

module.exports = nextConfig