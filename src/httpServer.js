import http from "node:http";
import { handleMcpMessage } from "./mcpProtocol.js";

const requestLog = new Map();

export function startHttpServer(config) {
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        sendJson(response, 200, {
          ok: true,
          name: "jlr-configurator-mcp",
          transport: "http",
        });
        return;
      }

      if (request.url === "/mcp" && !isAuthorized(request, config)) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      if (request.url === "/mcp" && !withinRateLimit(request, config)) {
        sendJson(response, 429, { error: "Rate limit exceeded" });
        return;
      }

      if (request.method === "GET" && request.url === "/mcp") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        response.write("event: endpoint\n");
        response.write("data: /mcp\n\n");
        response.end();
        return;
      }

      if (request.method === "POST" && request.url === "/mcp") {
        const body = await readBody(request);
        const payload = JSON.parse(body || "{}");
        if (Array.isArray(payload)) {
          const results = await Promise.all(payload.map(handleMcpMessage));
          sendJson(response, 200, results);
        } else {
          sendJson(response, 200, await handleMcpMessage(payload));
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
  });
  response.end(JSON.stringify(payload));
}
