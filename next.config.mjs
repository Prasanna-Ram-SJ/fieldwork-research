/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  serverExternalPackages: ['pdfjs-dist'],
  distDir: process.env.FIELDWORK_BUILD_CLOUDFLARE === 'true' ? '.next' : process.env.NODE_ENV === 'production' ? '.next-production' : '.next',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
