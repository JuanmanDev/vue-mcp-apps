# MCP Apps protocol reference

This covers the `io.modelcontextprotocol/ui` extension, spec **2026-01-26**, as implemented by `@modelcontextprotocol/ext-apps` 2.x. The wire protocol is identical between ext-apps 1.x and 2.x.

Sources:

- https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx
- the `specification/draft/` folder of the same repository.

## Discovery

- **Client capability:**

  ```json
  { "capabilities": { "extensions": { "io.modelcontextprotocol/ui": { "mimeTypes": ["text/html;profile=mcp-app"] } } } }
  ```

  Use `clientSupportsMcpApps(caps)` to check it.

- **Tool definition `_meta`:**

  ```json
  { "ui": { "resourceUri": "ui://cards/x", "visibility": ["model", "app"] }, "ui/resourceUri": "ui://cards/x" }
  ```

  - The flat `ui/resourceUri` key is deprecated; it is kept for older hosts.
  - `visibility` defaults to `["model", "app"]`.
  - `["app"]` hides the tool from the model.
  - A host must refuse an app's `tools/call` on a tool without `"app"`. App-only tools are never callable across servers.

- **Template resource:**
  - `mimeType: "text/html;profile=mcp-app"`;
  - `_meta.ui` = `{ csp?, permissions?, domain?, prefersBorder? }`;
  - `_meta.ui` may sit on the `resources/list` entry or on the `resources/read` content item; the content item wins.
    - `csp`: `{ connectDomains?, resourceDomains?, frameDomains?, baseUriDomains? }`
    - `permissions`: `{ camera?, microphone?, geolocation?, clipboardWrite? }`, each `{}`. These map to the iframe's `allow` attribute; apps must feature-detect.
    - `domain`: a dedicated sandbox origin; its format is host-defined.

- **Tool result:** `content` is for the model; `structuredContent` is for the view. In vue-mcp-apps, `structuredContent.card = { name, props }`.

## View → host

| Method | Type | Params | Result |
| --- | --- | --- | --- |
| `ui/initialize` | request | `{ appInfo: {name, version}, appCapabilities: { availableDisplayModes?, tools? }, protocolVersion }` | `{ protocolVersion, hostInfo, hostCapabilities, hostContext }` |
| `ui/notifications/initialized` | notification | `{}` | — |
| `tools/call` | request | `{ name, arguments }` | `CallToolResult` (proxied to the view's own server) |
| `resources/read` / `resources/list` | request | standard MCP | standard MCP |
| `ui/open-link` | request | `{ url }` | `{}` |
| `ui/message` | request | `{ role: 'user', content: ContentBlock[] }` | `{ isError? }` |
| `ui/update-model-context` | request | `{ content?: ContentBlock[], structuredContent? }` | `{}` |
| `ui/request-display-mode` | request | `{ mode: 'inline' \| 'fullscreen' \| 'pip' }` | `{ mode }` (granted) |
| `ui/notifications/size-changed` | notification | `{ width, height }` | — |
| `notifications/message` | notification | `{ level, logger?, data }` | — |
| `ping` | request | `{}` | `{}` |
| `ui/download-file` | request (draft) | file payload | — |
| `ui/notifications/request-teardown` | notification (draft) | `{}` | — |

## Host → view

| Method | Type | Params |
| --- | --- | --- |
| `ui/notifications/tool-input-partial` | notification (0..n) | `{ arguments }`, the arguments as streamed so far |
| `ui/notifications/tool-input` | notification (exactly once, before the result) | `{ arguments }` |
| `ui/notifications/tool-result` | notification | `CallToolResult` |
| `ui/notifications/tool-cancelled` | notification | `{ reason? }` |
| `ui/notifications/host-context-changed` | notification | the changed `hostContext` fields only |
| `ui/resource-teardown` | request | `{}` → the view answers `{}` |
| `ping` | request | `{}` |
| `tools/call`, `tools/list` | request (draft) | app-provided tools |

The host must not send anything to the view before `ui/notifications/initialized`. The host may forward any method that does not start with `ui/` to the MCP server, or block it, or ask the user first.

## hostContext

| Field | Type |
| --- | --- |
| `toolInfo` | `{ id?, tool: Tool }` |
| `theme` | `'light' \| 'dark'` |
| `styles` | `{ variables?: Record<CssVar, string>, css?: { fonts?: string } }` |
| `displayMode` | `'inline' \| 'fullscreen' \| 'pip'` |
| `availableDisplayModes` | `DisplayMode[]` |
| `containerDimensions` | `{ height \| maxHeight, width \| maxWidth }` |
| `locale` | BCP 47 string (for example `es-ES`) |
| `timeZone` | IANA string |
| `userAgent` | string |
| `platform` | `'web' \| 'desktop' \| 'mobile'` |
| `deviceCapabilities` | `{ touch?, hover? }` |
| `safeAreaInsets` | `{ top, right, bottom, left }` |

### Style variable names (`styles.variables`)

- **Colours:** `--color-{background,text,border,ring}-{primary,secondary,tertiary,inverse,ghost,info,danger,success,warning,disabled}`. The ring family has primary, secondary, inverse, info, danger, success and warning only.
- **Fonts:**
  - `--font-sans`, `--font-mono`
  - `--font-weight-{normal,medium,semibold,bold}`
  - `--font-text-{xs,sm,md,lg}-{size,line-height}`
  - `--font-heading-{xs,sm,md,lg,xl,2xl,3xl}-{size,line-height}`
- **Shape:** `--border-radius-{xs,sm,md,lg,xl,full}`, `--border-width-regular`, `--shadow-{hairline,sm,md,lg}`

vue-mcp-apps mirrors a subset onto Nuxt UI tokens (`NUXT_UI_TOKENS`, see `api.md`).

## hostCapabilities

| Field | Value |
| --- | --- |
| `openLinks` | `{}` |
| `downloadFile` | `{}` |
| `serverTools` | `{ listChanged? }` |
| `serverResources` | `{ listChanged? }` |
| `logging` | `{}` |
| `sandbox` | `{ permissions?, csp? }` |
| `updateModelContext` | modalities, for example `{ text: {} }` |
| `message` | modalities, for example `{ text: {} }` |
| `sampling` | `{ tools? }` |
| `experimental` | `{}` |

## Web hosts: the sandbox proxy

1. The host page frames a **proxy** on a **different origin**, with `sandbox="allow-scripts allow-same-origin"` (plus `allow-forms` in practice).
2. The proxy sends `ui/notifications/sandbox-proxy-ready` (`{}`).
3. The host sends `ui/notifications/sandbox-resource-ready`: `{ html, sandbox?, csp?, permissions? }`. `sandbox` overrides the inner iframe's sandbox attribute.
4. The proxy creates the inner view iframe, with the CSP from `csp` and `allow` from `permissions`. It then relays every message except `ui/notifications/sandbox-*`, and creates no requests of its own.

basic-host:

- uses `allow-scripts allow-same-origin allow-forms` for the inner iframe;
- serves the CSP as an HTTP header;
- builds `allow` with `buildAllowAttribute(permissions)` from `@modelcontextprotocol/ext-apps/app-bridge`.

The vue-mcp-apps playground proxy (`playground/public/sandbox.html`) injects the CSP as a `<meta>` instead.

**Default CSP when there is no `ui.csp`:**

```
default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; media-src 'self' data:; connect-src 'none'
```

With `csp` declared:

- `resourceDomains` is added to `script-src`, `style-src`, `img-src`, `font-src` and `media-src`;
- `connectDomains` is added to `connect-src 'self'`;
- `frame-src` is `frameDomains`, otherwise `'none'`;
- `object-src 'none'` always;
- `base-uri` is `baseUriDomains`, otherwise `'self'`.

A host must not allow domains that were not declared.

## Official SDK names (ext-apps 2.0.x)

- **`App` (view side):**
  - Events: `ontoolinput`, `ontoolinputpartial`, `ontoolresult`, `ontoolcancelled`, `onhostcontextchanged`, `onteardown`.
  - Methods: `callServerTool`, `sendMessage`, `openLink`, `updateModelContext`, `requestDisplayMode`, `getHostContext`, `sendSizeChanged`.
- **`AppBridge` (host side):**
  - Constructor: `new AppBridge(client|null, hostInfo, hostCapabilities, { hostContext })`.
  - Sending to the view: `sendToolInput`, `sendToolInputPartial`, `sendToolResult`, `sendToolCancelled`, `setHostContext`, `teardownResource`, `sendSandboxResourceReady`.
  - Event setters: `oninitialized`, `onsandboxready`, `onsizechange`, `oncalltool`, `onopenlink`, `onmessage`, `onupdatemodelcontext`, `onrequestdisplaymode`, `onreadresource`, `onloggingmessage`.
  - `setHostContext` sends only the changed fields.
- **`PostMessageTransport(eventTarget, eventSource)`:** listens on `window` and checks `event.source`.
- **Server helpers** (`/server`): `registerAppTool`, `registerAppResource`, `RESOURCE_MIME_TYPE`, `RESOURCE_URI_META_KEY`, `EXTENSION_ID`, `getUiCapability`.
- **Peer dependencies:** `@modelcontextprotocol/client|core|server@^2`, `zod@^4.2`.

## Hosts that render MCP Apps

- Claude (claude.ai and Desktop)
- VS Code ≥ 1.109
- Goose
- ChatGPT
- Postman
- MCPJam Inspector
- the mcp-use inspector
- the official MCP Inspector ≥ 0.20 (Apps tab)
- ext-apps `examples/basic-host` (the reference host)
