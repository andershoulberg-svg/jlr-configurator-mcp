const serverUrl = process.env.MCP_SERVER_URL || "http://127.0.0.1:3000/mcp";
const token = process.env.MCP_AUTH_TOKEN || "";
const toolName = process.env.MCP_TOOL_NAME || "summarize_jlr_configuration";
const toolArguments = JSON.parse(process.env.MCP_TOOL_ARGUMENTS_JSON || "{\"market\":\"en_gb\",\"nameplate\":\"l460\"}");

const headers = {
  "content-type": "application/json",
};

if (token) {
  headers.authorization = `Bearer ${token}`;
}

async function rpc(method, params, id) {
  const response = await fetch(serverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
  return JSON.parse(text);
}

console.log(JSON.stringify(await rpc("initialize", {}, 1), null, 2));
console.log(JSON.stringify(await rpc("tools/list", {}, 2), null, 2));
console.log(JSON.stringify(await rpc("tools/call", { name: toolName, arguments: toolArguments }, 3), null, 2));
