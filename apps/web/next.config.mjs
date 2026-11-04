const apiUrl = process.env.BBDA_API_URL ?? 'http://127.0.0.1:3000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${apiUrl}/api/v1/:path*` }];
  },
};

export default nextConfig;
