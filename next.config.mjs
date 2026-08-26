/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The bookmarklet endpoint reads public/autofill.js off disk at request
    // time, so the file has to be traced into the serverless bundle.
    // (Top-level in Next 15; still experimental in 14.)
    outputFileTracingIncludes: {
      "/api/autofill/bookmarklet": ["./public/autofill.js"],
      // The Jobright Agent tab reads the agent's committed state files at
      // request time, so they too must be traced into the serverless bundle.
      "/api/agent": ["./data/agent/**"],
    },
  },
};
export default nextConfig;
