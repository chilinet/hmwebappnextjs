/** @type {import('next').NextConfig} */
// Browser-Fetches: REPORTING_URL allein liegt nicht im Client-Bundle. Über env wird eine
// NEXT_PUBLIC_REPORTING_URL eingetragen (Priorität siehe reportingUrlForClient).
const reportingUrlForClient =
  process.env.NEXT_PUBLIC_REPORTING_URL ||
  process.env.NEXT_PUBLIC_REPORTING_URL_LOCAL ||
  process.env.REPORTING_URL ||
  'https://webapptest.heatmanager.cloud';

const nextConfig = {
  env: {
    NEXT_PUBLIC_REPORTING_URL: reportingUrlForClient,
    // Client-Bundle: gleiche DEBUG-Variable wie serverseitig (.env DEBUG=true)
    NEXT_PUBLIC_DEBUG: process.env.DEBUG ?? '',
  },
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