/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@guardian/shared'],
  experimental: {
    turbo: {},
  },
}

module.exports = nextConfig
