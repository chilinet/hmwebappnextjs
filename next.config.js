/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone", // Macht die Anwendung unabhängig von Node_Modules
  experimental: {
    appDir: true,
  },
};

module.exports = nextConfig;
