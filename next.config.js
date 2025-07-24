/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // 'appDir' entfernen, da es nicht mehr benötigt wird
  },
  output: 'standalone',
  // Disable telemetry during build
  // telemetry: false, // This option is not valid in Next.js 14
}

module.exports = nextConfig
