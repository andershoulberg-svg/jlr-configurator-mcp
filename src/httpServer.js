import http from "node:http";
import { handleMcpMessage } from "./mcpProtocol.js";

const requestLog = new Map();

export function startHttpServer(config) {
  const server = http.createServer(async (request, response) => {
    try {
      const { pathname } = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

      if (request.method === "OPTIONS") {
        sendCors(response, 204);
        return;
      }

      if (request.method === "GET" && pathname === "/health") {
        sendJson(response, 200, {
          ok: true,
          name: "jlr-configurator-mcp",
          transport: "http",
        });
        return;
      }

      if (request.url === "/.well-known/oauth-protected-resource") {
        sendJson(response, 404, { error: "OAuth is not enabled for this test server" });
        return;
      }

      const isMcpPath = pathname === "/mcp" || pathname === "/mcp/";

      if (isMcpPath && !isAuthorized(request, config)) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      if (isMcpPath && !withinRateLimit(request, config)) {
        sendJson(response, 429, { error: "Rate limit exceeded" });
        return;
      }

      if (request.method === "GET" && isMcpPath) {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
          ...corsHeaders(),
        });
        response.write("event: endpoint\n");
        response.write("data: /mcp\n\n");
        response.end();
        return;
      }

      if (request.method === "POST" && isMcpPath) {
        const body = await readBody(request);
        const payload = JSON.parse(body || "{}");
        const result = Array.isArray(payload)
          ? await Promise.all(payload.map(handleMcpMessage))
          : await handleMcpMessage(payload);
        if (wantsEventStream(request)) {
          sendSse(response, result);
          return;
        }
        if (Array.isArray(payload)) {
          sendJson(response, 200, result);
        } else {
          sendJson(response, 200, result);
        }
        return;
      }

      sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      sendJson(response, 500, { error: error.message || String(error) });
    }
  });

  server.listen(config.port, config.host, () => {
    console.error(`JLR configurator MCP listening on http://${config.host}:${config.port}/mcp`);
  });

  return server;
}

function isAuthorized(request, config) {
  if (config.allowUnauthenticatedHttp || !config.authToken) return true;
  const header = request.headers.authorization || "";
  return header === `Bearer ${config.authToken}`;
}

function withinRateLimit(request, config) {
  const limit = Number(config.rateLimitPerMinute || 60);
  if (!Number.isFinite(limit) || limit <= 0) return true;

  const key = request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const windowStart = now - 60_000;
  const hits = (requestLog.get(key) || []).filter((time) => time > windowStart);
  hits.push(now);
  requestLog.set(key, hits);

  return hits.length <= limit;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function sendCors(response, status) {
  response.writeHead(status, corsHeaders());
  response.end();
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,mcp-session-id",
    "access-control-expose-headers": "mcp-session-id",
  };
}

function wantsEventStream(request) {
  const accept = request.headers.accept || "";
  return accept.includes("text/event-stream");
}

function sendSse(response, payload) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    ...corsHeaders(),
  });
  response.write("event: message\n");
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
  response.end();
}
