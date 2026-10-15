# FAQ

### What is an MCP App?

An MCP tool whose definition points to a `ui://` HTML template (`_meta.ui.resourceUri`). The host (Claude, VS Code, Goose, ChatGPT…) draws the template in a sandboxed iframe, sends it the tool's input and result over JSON-RPC `postMessage`, and relays the view's requests (tool calls, links, messages) back. Spec: [`io.modelcontextprotocol/ui`, 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx).

### MCP UI vs MCP Apps?

"MCP UI" is the community project ([mcpui.dev](https://mcpui.dev)) that pioneered UI resources; MCP Apps is the official extension that grew out of it. mcp-ui's client now speaks MCP Apps too. vue-mcp-apps targets MCP Apps.

### Do I need Nuxt or Nuxt UI?

No. Cards are Vue 3 components; Nuxt UI is optional and runs as a Vue plugin. Any component library works, or none — the bundle inlines whatever CSS your cards import.

### Can I use React or Svelte?

The **server kit** only needs a bundle `{ script, css, cards }`; build your view however you like and speak the protocol (e.g. with ext-apps' `App`). `@vue-mcp-apps/view` and the native `<McpCard>` are Vue-only.

### Does the same card really run in my app and in Claude?

Yes. `<McpCard>` renders the component directly in your Vue app; the bundle runs the same component in the host's iframe. Both go through `CardRenderer`, so a click means the same thing in both.

### What happens in a host without MCP Apps support?

It ignores the template and shows the tool's text `content`. Always write a useful text in `kit.result(name, props, text)`.

### Why is a card limited to declared actions?

Props come from tool results, which may contain data an attacker influenced (an email, a web page). If a card could call any tool by name, poisoned props could trigger anything. With actions as data, an event can only ever run the tool the manifest names for it.

### How do I make a tool that only the card can call?

`kit.registerTool(server, 'apply_changes', { card: 'approval-card', visibility: ['app'], … }, handler)`. Hosts hide it from the model and allow it from the card.

### Can a card fetch data?

Only from origins declared in its manifest: `resource: { csp: { connectDomains: ['https://api.example.com'] } }`. Prefer calling a tool of your own server instead (a `tool` action) — it goes through the host's checks and works offline-first.

### How big is a template?

The demo bundle is about 290 kB of script and 190 kB of CSS (Vue + Nuxt UI + three cards), inlined in every template. Hosts cache resources; per-card bundles are on the roadmap.

### Can I keep secrets in props?

No. Props travel through the host, stay in the conversation history and are readable by anyone who can inspect the iframe. Use an opaque id and fetch on the server.

### Does the AI demo send my data anywhere?

Chrome built-in AI, WebLLM and Scripted run entirely in your browser. The OpenAI-compatible provider sends the conversation only to the endpoint you configure. See [AI_DEMO.md](AI_DEMO.md).

### Why does the playground need `localhost` and not `127.0.0.1`?

The sandbox proxy is served from the *other* hostname so it lands on a different origin, like a real host. On a single-origin deployment (GitHub Pages) the playground uses an opaque sandbox instead.

### Is this an official MCP project?

No. It builds on the official spec and SDK (and tests against the official `AppBridge`), but it is an independent MIT project.

### Which MCP SDK version?

Server helpers work with SDK v2 (`@modelcontextprotocol/server`) and v1 (`@modelcontextprotocol/sdk`). The example and playground use v2.
