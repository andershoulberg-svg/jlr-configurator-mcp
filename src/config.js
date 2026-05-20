export function getConfig(env = process.env) {
  const port = Number(env.PORT || env.MCP_PORT || 3000);

  return {
    transport: env.MCP_TRANSPORT || (env.PORT ? "http" : "stdio"),
    host: env.MCP_HOST || "127.0.0.1",
    port: Number.isFinite(port) ? port : 3000,
    authToken: env.MCP_AUTH_TOKEN || "",
    allowUnauthenticatedHttp: env.ALLOW_UNAUTHENTICATED_HTTP === "1",
    rateLimitPerMinute: Number(env.MCP_RATE_LIMIT_PER_MINUTE || 60),
  };
}

