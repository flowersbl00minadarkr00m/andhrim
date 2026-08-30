import { randomBytes } from "node:crypto";
import type { NextConfig } from "next";
import { withEve } from "eve/next";

process.env.AGENT_OR_NOT_SESSION_NONCE ??= randomBytes(32).toString("base64url");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
};

export default withEve(nextConfig, { devServerTimeoutMs: 120_000 });
