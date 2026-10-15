# Glossary

| Term | Meaning | In code |
| --- | --- | --- |
| **MCP** | Model Context Protocol: how assistants talk to tool servers. | `@modelcontextprotocol/*` |
| **MCP Apps** | The `io.modelcontextprotocol/ui` extension: tools with interactive UIs. Spec 2026-01-26. | `MCP_APPS_EXTENSION`, `MCP_APPS_PROTOCOL_VERSION` |
| **MCP UI** | The community project that preceded MCP Apps; often used as a synonym. | — |
| **Card** | A Vue component that draws one kind of tool result. Props in, events out. | `examples/demo-cards/src/cards/*.vue` |
| **Card name** | Kebab-case id with at least one dash (`weather-card`). Names the template and the component. | manifest keys |
| **Manifest** | The frozen table of cards: title, description, actions, propsSchema, fixtures, resource (CSP, permissions, border). | `defineCards`, `CardManifest`, `CardSpec` |
| **Action** | What one card event may ask for: `tool`, `link`, `notify`, `message`, `context`. | `CardActionSpec` (declared), `CardAction` (resolved) |
| **Payload** | The first argument a card emits with an event. | `cardActionFor(manifest, name, event, args)` |
| **Fixture** | Named example props of a card (playground, tests, docs). | `CardSpec.fixtures` |
| **Bundle** | One JSON file with the view script, the CSS, the card names and a source hash. | `cards.json`, `CardBundle`, `defineCardBundleConfig` |
| **Template** | The `ui://cards/<name>` resource: a self-contained HTML document with the bundle inlined. Mime `text/html;profile=mcp-app`. | `cardTemplateHtml`, `MCP_APP_MIME`, `cardUri` |
| **Server kit** | Server helpers bound to one manifest and bundle. | `createCardServerKit` |
| **`structuredContent.card`** | Where a result carries `{ name, props }` for the view. | `kit.result`, `cardResult`, `resultCard` |
| **`content`** | The text blocks of a result: what the model reads and text-only hosts show. | `resultText` |
| **Visibility** | Who may call a tool: `model`, `app` (a view), or both (default). | `_meta.ui.visibility`, `ToolVisibility` |
| **Host** | The application that frames templates and talks to the server: Claude, VS Code, the playground. | `AppBridge` (ext-apps) |
| **Sandbox proxy** | Middle iframe on another origin that frames the view and relays messages; never answers requests itself. | `playground/public/sandbox.html` |
| **Opaque origin** | The `null` origin of an iframe sandboxed without `allow-same-origin`; used when only one origin is available. | *Proxy origin: opaque* |
| **View** | The template running in the innermost iframe. | `startMcpApp`, `McpAppBridge` |
| **Host context** | What the host tells the view: theme, locale, style variables, display mode, container size, tool info… | `HostContext`, `useCardHost().hostContext` |
| **Style variables** | Host design tokens as CSS variables (`--color-background-primary`, `--font-sans`…), mirrored onto Nuxt UI tokens. | `applyHostContext`, `NUXT_UI_TOKENS` |
| **Native host** | Your own Vue app rendering the card directly. | `<McpCard>`, `CardRenderer` |
| **Card swap** | A card's tool action returns another card, which replaces it in place. | `startMcpApp`, `McpCard :call-tool` |
| **Workbench** | The playground page with the native pane, the three-layer pane and the inspector. | `#/workbench` |
| **AI demo** | The playground page where an in-browser assistant calls tools and cards appear in the chat. | `#/`, `playground/src/ai/` |
| **Provider** | A way to run the demo assistant: Chrome built-in AI, WebLLM, OpenAI-compatible, Scripted. | `AiProvider` |
| **Decision** | A provider's output: call a tool or answer. | `Decision`, `decisionSchema`, `parseDecision` |
| **`vue-mcp-apps:source`** | Custom export condition that resolves workspace packages to their TypeScript sources. | package.json `exports` |
