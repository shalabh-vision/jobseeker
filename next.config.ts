import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // npm workspace: packages are installed once in D:\AppHub\node_modules, so Turbopack's root is the hub folder.
  turbopack: { root: path.join(__dirname, "..") },
  // Native ODBC driver for SQL Server (Windows authentication); must not be bundled.
  serverExternalPackages: ["mssql", "msnodesqlv8"],
  experimental: {
    // Resume uploads are capped at 5 MB in the action; leave room for multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
