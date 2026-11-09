/** @type {import('next').NextConfig} */
const API = process.env.API_URL || "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // The browser only ever talks to this Next server; Next proxies /v1 to FastAPI.
  // Keeps the API origin out of the browser and avoids CORS in every environment.
  async rewrites() {
    return [{ source: "/v1/:path*", destination: `${API}/v1/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
