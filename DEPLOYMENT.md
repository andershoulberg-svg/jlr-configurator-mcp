# Hosting And ChatGPT Test Checklist

This project is ready to host as a remote MCP server. The quickest path is GitHub plus Render.

## 1. Push To GitHub

From this folder:

```powershell
git init
git add .
git commit -m "Add JLR configurator MCP"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 2. Deploy On Render

1. Create a new Render Web Service from the GitHub repo.
2. Use Docker runtime.
3. Leave root directory blank.
4. Health check path: `/health`.
5. Use the included `render.yaml` blueprint if Render detects it.

The default blueprint sets:

```text
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_RATE_LIMIT_PER_MINUTE=60
ALLOW_UNAUTHENTICATED_HTTP=1
```

`ALLOW_UNAUTHENTICATED_HTTP=1` is intentional for ChatGPT Developer Mode testing because Developer Mode supports OAuth or no authentication. This MCP is read-only and only uses public JLR configurator payloads. For broader sharing, implement OAuth or place it behind a controlled test environment.

## 3. Verify The Hosted Endpoint

Replace `<host>` with the Render URL.

```powershell
$env:MCP_SERVER_URL = "https://<host>/mcp"
$env:MCP_TOOL_NAME = "summarize_jlr_configuration"
$env:MCP_TOOL_ARGUMENTS_JSON = '{"market":"en_gb","nameplate":"l460"}'
node scripts/smoke-http-mcp.mjs
```

Expected:

- `/health` returns `ok: true`
- `initialize` returns `jlr-configurator-mcp`
- `tools/list` returns 8 tools
- `summarize_jlr_configuration` returns a UK Range Rover summary with a formatted gross price

## 4. Connect In ChatGPT Developer Mode

Based on OpenAI Developer Mode docs:

1. In ChatGPT, open Settings.
2. Go to Apps or Connectors, then Advanced settings.
3. Enable Developer Mode.
4. Create an app from a remote MCP server.
5. MCP server URL: `https://<host>/mcp`
6. Authentication: No Authentication for the short-lived demo.
7. Refresh the app/tool list and confirm the seven JLR tools appear.

Good test prompts:

```text
Use the JLR configurator MCP only. Find UK Range Rover configurators.
```

```text
Use the JLR configurator MCP only. Summarize the UK Range Rover default build with price.
```

```text
Use the JLR configurator MCP only. What changes if I add Comfort Pack to a Range Rover HSE D300?
```

```text
Use the JLR configurator MCP only. Compare Range Rover HSE D300 against SV.
```

```text
Use the JLR configurator MCP only. What are the towing and WLTP figures?
```

## 5. Safer Follow-Up Before Wider Sharing

Before wider colleague/client sharing:

- Replace no-auth demo mode with OAuth.
- Add a public landing/health page explaining that the server is read-only.
- Add deployment monitoring and request logs without personal data.
- Keep rate limiting enabled.
