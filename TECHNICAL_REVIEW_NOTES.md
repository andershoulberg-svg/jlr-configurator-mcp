# Technical Review Notes

This MCP is a working client-demo pilot. It is intentionally small and dependency-light, but a senior developer should treat the following items as known production-readiness gaps rather than hidden assumptions.

## Already Mitigated In The Pilot

- User-provided configurator URLs are restricted to official Range Rover/Land Rover hosts before redirects are followed.
- The public Render endpoint is documented as a short-lived no-auth test mode, not a production posture.
- The MCP defaults to the UK market and explicitly avoids Denmark unless the user asks for it.
- The handout no longer depends on a hotlinked inline JLR asset that can return `403`.

## Likely Senior-Developer Concerns

### Authentication and exposure

The Render pilot uses `ALLOW_UNAUTHENTICATED_HTTP=1` so ChatGPT Developer Mode can test it quickly. Production should use OAuth or another JLR-approved auth pattern. The current open endpoint is acceptable only for a controlled demo because it is read-only and calls public configurator payloads.

### MCP transport maturity

The server implements a minimal JSON-RPC/MCP HTTP surface by hand for simplicity. It supports `initialize`, `tools/list`, `tools/call`, `ping`, CORS, and event-stream responses. A production version should move to an official MCP SDK or fully align with the current Streamable HTTP transport, including session handling and protocol-version tracking.

### Public configurator dependency

The MCP relies on public configurator URLs and public rules payloads. JLR can change model-year paths, feature IDs, JSONP shape, availability rules, media URLs or price exposure without warning. Production should use a JLR-owned API contract or add monitoring around payload changes.

### Tests are partly live

The current tests intentionally validate live public JLR payloads for demo confidence. That also makes CI brittle. Production should split tests into deterministic fixture tests plus a smaller scheduled live contract monitor.

### Heuristic adviser logic

`advise_jlr_uk_build` is deliberately transparent heuristic scoring. It is useful for a demo, but production should review the recommendation policy with JLR product, legal and compliance teams, especially where fuel, company-car use, towing, emissions or pricing affect advice.

### CORS and rate limiting

CORS is permissive for ChatGPT compatibility, and the in-memory rate limiter is simple. Production should apply tighter origin policy where possible, persistent or edge-level rate limiting, structured logs, and alerting.

### Data and claims boundary

The MCP does not access saved builds, stock, finance, orders, VIN, retailer systems, incentives, discounts, insurance or delivery estimates. This boundary should remain explicit in any client or consumer-facing deployment.

## Recommended Next Engineering Steps

1. Replace no-auth pilot mode with OAuth.
2. Move the HTTP transport to an official MCP SDK or a fully spec-compliant Streamable HTTP implementation.
3. Add fixture-based tests for representative UK Range Rover, Sport, Velar and Evoque payloads.
4. Add a live contract monitor for configurator URL resolution and payload shape.
5. Split the large adapter into source resolution, feature parsing, price/spec parsing, comparison and adviser modules.
6. Add structured observability: request counts, upstream failures, latency, cache hit rate and tool errors.
7. Agree a JLR-approved recommendation policy for customer guidance.
