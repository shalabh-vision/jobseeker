import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native ODBC driver for SQL Server (Windows authentication); must not be bundled.
  serverExternalPackages: ["mssql", "msnodesqlv8"],
  experimental: {
    // Resume uploads are capped at 5 MB in the action; leave room for multipart overhead.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
