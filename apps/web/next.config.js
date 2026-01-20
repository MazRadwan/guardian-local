/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@guardian/shared'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://16-54-72-26.sslip.io',
    NEXT_PUBLIC_WEBSOCKET_URL: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'https://16-54-72-26.sslip.io',
    NEXT_PUBLIC_ENABLE_DEV_MODE: process.env.NEXT_PUBLIC_ENABLE_DEV_MODE || 'true',
  },
}

module.exports = nextConfig
