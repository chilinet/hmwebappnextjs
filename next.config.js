/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    // 'appDir' entfernen, da es nicht mehr benötigt wird
  }
}

module.exports = nextConfig
