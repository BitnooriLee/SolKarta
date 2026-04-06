import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin Turbopack root when a parent folder also has package-lock.json (avoids wrong workspace root).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
