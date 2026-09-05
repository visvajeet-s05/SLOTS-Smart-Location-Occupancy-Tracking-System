/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
      },
      {
        protocol: 'https',
        hostname: 'localhost',
        port: '',
      },
      // Railway deployment domains
      {
        protocol: 'https',
        hostname: '*.up.railway.app',
      },
      {
        protocol: 'https',
        hostname: 'yourdomain.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
    ],
  },
  // Disable Strict Mode to prevent double WebSocket connections in dev
  reactStrictMode: false,
  // Disable build workers to prevent hanging
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },

  // Webpack configuration
  webpack: (config) => {
    config.performance = {
      hints: false,
    };
    return config;
  },

  // Security headers configuration
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
        ],
      },
    ]
  },
}

export default nextConfig
