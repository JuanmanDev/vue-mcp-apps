/**
 * The demo server on stdio — for Claude Desktop, VS Code, the MCP Inspector:
 *
 *   npx @modelcontextprotocol/inspector npx tsx --conditions=vue-mcp-apps:source examples/demo-cards/src/server/stdio.ts
 */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { createDemoServer } from './createServer'
import { readCardBundle } from './bundle'

const server = createDemoServer({ bundle: readCardBundle() })
await server.connect(new StdioServerTransport())
console.error('[demo-cards] MCP server on stdio')
