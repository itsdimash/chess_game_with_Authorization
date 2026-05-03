/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Auth callback must NOT have COOP/COEP — they break OAuth redirects
        source: '/auth/callback',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Opener-Policy',   value: 'unsafe-none' },
        ],
      },
      {
        // Everything else gets the strict headers Stockfish needs
        source: '/((?!auth/callback).*)',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
          { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
