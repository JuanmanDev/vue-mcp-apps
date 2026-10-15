/**
 * The demo server over Streamable HTTP at http://localhost:3001/mcp — for the
 * playground's "Remote server" mode, the MCP Inspector, ext-apps' basic-host,
 * or claude.ai through a tunnel.
 *
 *   npm run server:http            (PORT=3001 by default)
 *
 * CORS: only the origins in ALLOWED_ORIGINS (comma-separated) may call it from a
 * browser — by default the local playground and the hosted demo. Hosts that are
 * not browsers (Claude Desktop, VS Code, the Inspector's proxy) ignore CORS.
 */
import { createServer } from 'node:http'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createDemoServer, createDemoStore } from './createServer'
import { readCardBundle } from './bundle'

const PORT = Number(process.env.PORT ?? 3001)
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS
  ?? 'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,https://juanmandev.github.io')
  .split(',').map(o => o.trim()).filter(Boolean))
const bundle = readCardBundle()
const store = createDemoStore()

const mcp = toNodeHandler(createMcpHandler(() => createDemoServer({ bundle, store })))

createServer((req, res) => {
  const origin = req.headers.origin
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id, authorization')
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version')
  } else if (origin) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end(`Origin ${origin} is not in ALLOWED_ORIGINS`)
    return
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204).end()
    return
  }
  if (!req.url?.startsWith('/mcp')) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('MCP endpoint is /mcp')
    return
  }
  Promise.resolve(mcp(req, res)).catch((error: unknown) => {
    console.error('[demo-cards]', error)
    if (!res.headersSent) res.writeHead(500).end()
  })
}).listen(PORT, () => {
  console.error(`[demo-cards] MCP server on http://localhost:${PORT}/mcp`)
})
