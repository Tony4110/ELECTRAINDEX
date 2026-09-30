import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the project root is this folder (ignore stray lockfiles higher up on the machine)
  outputFileTracingRoot: here,
};
export default nextConfig;
