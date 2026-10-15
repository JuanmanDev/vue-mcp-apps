# Security policy

## Reporting a vulnerability

Please report vulnerabilities **privately** through GitHub: *Security → Report a vulnerability* on [JuanmanDev/vue-mcp-apps](https://github.com/JuanmanDev/vue-mcp-apps/security/advisories/new). Do not open a public issue. You will get an acknowledgement within a few days; fixes are released as patch versions with an advisory.

Supported versions: the latest `0.x` release.

## Threat model in brief

MCP Apps put UI built from **tool results** — data that may contain attacker-influenced text (an email, a web page, a ticket) — inside an assistant that can run tools. vue-mcp-apps is designed so that poisoned data cannot turn a card into a tool-calling weapon.

| Risk | Mitigation |
| --- | --- |
| A card's props trick it into calling a dangerous tool | **Actions are data.** The manifest (`defineCards`, frozen) maps each event to one action; a `tool` action always runs the declared tool. Unlisted events are ignored. |
| The model calls a tool that should need a human | **Visibility.** Card-only tools carry `_meta.ui.visibility: ['app']`; hosts hide them from the model and refuse model calls. Hosts refuse view calls to tools without `'app'`. |
| The view reaches the host's cookies, storage or DOM | **Sandbox + other origin.** Hosts frame a sandbox proxy on another origin (or an opaque one), which frames the view in `srcdoc` with a CSP built from `_meta.ui.csp`. |
| The view exfiltrates data | **Templates fetch nothing** by default (`connectDomains: []`). Cards that must fetch declare origins explicitly. |
| A forged message reaches the view | `McpAppBridge` only accepts messages whose `source` is `window.parent`. |
| Links to `javascript:` / `data:` URLs | `safeLinkUrl` allows http(s) only. |
| Script injection through inlined code | Templates escape `</script`, `</style` and `<!--` (`inlineSafe`); titles and names are HTML-escaped. |
| Secrets leaking through props | Never put secrets in props: they travel through the host and stay in the conversation. Pass opaque ids. |
| Any website calling a local HTTP server | The demo HTTP server uses a CORS **allowlist** (`ALLOWED_ORIGINS`) and answers 403 to other browser origins. |
| API keys in the AI demo | The OpenAI-compatible provider keeps its key in the tab's memory only and sends it only to the endpoint you typed. Chrome built-in AI, WebLLM and Scripted keep everything in the browser. |

Hosts built on vue-mcp-apps (or copying `playground/src/lib/sandboxHost.ts`) must keep the visibility checks in `oncalltool`, serve the proxy from another origin, and send plain JSON only.
