/** @type {import('next').NextConfig} */
const API = process.env.API_URL || "http://127.0.0.1:8000";

// The rewrite destination below is baked into the build. If API_URL is missing when you
// run `next build`, `next start` proxies /v1 to whatever the default is and every API call
// answers 500 from the browser — which looks like a broken app, not a missing variable.
if (!process.env.API_URL && process.env.NODE_ENV === "production") {
  console.warn(
    `[sentinel] API_URL is not set at build time; /v1 will proxy to ${API}. ` +
      "Set API_URL to your FastAPI origin before `next build` (see README §8).",
  );
}

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
