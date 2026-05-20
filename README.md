# JLR Configurator MCP

Client-demo MCP server for public JLR/Range Rover configurator payloads.

It can act like a market-aware product specialist in ChatGPT:

- Find current public configurators for Denmark, UK, Germany, US and international markets.
- Resolve shorthand URLs such as `https://www.rangerover.com/lr/da_dk/l460/ipr/personalise/` to the current expanded vehicle/model-year/version URL.
- Search features by natural terms such as `Santorini`, `Comfort Pack`, `P460e`, `22 inch`, or `pet pack`.
- Summarize builds with market-aware prices where the public payload exposes them.
- Preview dependency changes before selecting a feature.
- Return technical specs, WLTP/towing/dimensions rows, standard features and media URLs.
- Compare 2-4 builds by price, key features and top specs.

The server uses public configurator payloads only. It does not call saved-build, stock, order, VIN, retailer, lead-time, or finance quote endpoints.

## MCP Tools

- `find_jlr_configurators`
- `list_jlr_configurator_features`
- `get_jlr_feature_details`
- `summarize_jlr_configuration`
- `preview_jlr_selection_change`
- `get_jlr_specs_and_standard_features`
- `compare_jlr_builds`

Backward-compatible aliases are also kept:

- `list_range_rover_features`
- `get_range_rover_feature_details`
- `summarize_range_rover_configuration`

## Public Data Contract

The adapter resolves public configurator pages and then reads public JLR rules payloads:

- Rules payload: `https://rules.config.landrover.com/rc/{brand}/{locale}/{vehicle_modelyear}/{version}/.jsonp?view=personalise&callback=config_rcjson`
- Selected build: `https://rules.config.landrover.com/rc/{brand}/{locale}/{vehicle_modelyear}/{version}/{feature-id}/.jsonp?view=personalise&callback=config_rcjson`
- Selection preview: `https://rules.config.landrover.com/rc/{brand}/{locale}/{vehicle_modelyear}/{version}/{current-selection}/.jsonp?q={feature-id}&view=personalise&callback=config_rcjson`

Known supported nameplates:

- `l460` Range Rover
- `l461` Range Rover Sport
- `l551` Range Rover Evoque
- `l560` Range Rover Velar

Default demo market is `da_dk`.

## Run Locally

Use Node.js 20+:

```powershell
npm test
$env:MCP_TRANSPORT = "http"
$env:MCP_AUTH_TOKEN = "local-dev-token"
node src/index.js
```

In another terminal:

```powershell
$env:MCP_SERVER_URL = "http://127.0.0.1:3000/mcp"
$env:MCP_AUTH_TOKEN = "local-dev-token"
$env:MCP_TOOL_NAME = "summarize_jlr_configuration"
$env:MCP_TOOL_ARGUMENTS_JSON = '{"market":"da_dk","nameplate":"l460"}'
node scripts/smoke-http-mcp.mjs
```

For stdio MCP clients, leave `MCP_TRANSPORT` unset and run:

```powershell
node src/index.js
```

## Example Natural Prompts

- "Find the Danish Range Rover configurators."
- "Summarize the Danish Range Rover default build with price."
- "Find Santorini Black and tell me the feature ID."
- "What changes if I add Comfort Pack to a Range Rover HSE D300?"
- "Compare Range Rover HSE D300 against SV."
- "What are the towing and WLTP figures?"

## Deployment Notes

For a public HTTP deployment, set:

```text
MCP_TRANSPORT=http
MCP_HOST=0.0.0.0
MCP_AUTH_TOKEN=<long random token>
MCP_RATE_LIMIT_PER_MINUTE=60
```

Do not expose a public unauthenticated endpoint unless it is a short-lived diagnostic.

