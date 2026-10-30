import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Public pages that read the URL query (filters, sort, pagination) are rendered on every request,
// so Next.js never caches them. They show the same content to every visitor, so we let Netlify's CDN
// keep each URL (query included, per Netlify's default cache key) for an hour, served instantly,
// refreshed in the background ("stale-while-revalidate"), and shared between edge nodes ("durable").
const CDN_HOUR = "public, durable, max-age=3600, stale-while-revalidate=604800";
const CDN_15MIN = "public, durable, max-age=900, stale-while-revalidate=86400";
const cached = (source, value = CDN_HOUR) => ({ source, headers: [{ key: "Netlify-CDN-Cache-Control", value }] });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the project root is this folder (ignore stray lockfiles higher up on the machine)
  outputFileTracingRoot: here,
  async headers() {
    return [
      cached("/"),
      cached("/agents"),
      cached("/mcp"),
      cached("/mcp/best/:capability"),
      cached("/themes/:slug"),
      cached("/tasks/:slug"),
      cached("/fr"),
      cached("/fr/themes/:slug"),
      cached("/fr/taches/:slug"),
      cached("/new", CDN_15MIN),
    ];
  },
};
export default nextConfig;
