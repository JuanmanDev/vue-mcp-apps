/**
 * The server kit against a REAL MCP SDK v2 server and client, over the
 * in-memory transport: what a host sees when it lists tools, reads a template
 * and calls a tool.
 */
import { describe, expect, it } from 'vitest'
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server'
import { Client } from '@modelcontextprotocol/client'
import { z } from 'zod'
import { defineCards, MCP_APP_MIME, MCP_APPS_EXTENSION } from '@vue-mcp-apps/core'
import { asCardBundle, cardResult, cardTemplateHtml, createCardServerKit, inlineSafe } from './index'

const cards = defineCards({
  'hello-card': {
    title: 'Hello',
    actions: { waved: { kind: 'tool', tool: 'wave_back' } },
    resource: { csp: { connectDomains: ['https://api.example.com'] }, prefersBorder: true },
  },
  'unbuilt-card': { title: 'Not in the bundle' },
})

const bundle = {
  cards: ['hello-card'],
  script: 'console.log("</script><!-- hi")',
  css: 'body{color:red}</style>',
}

async function connect(kitBundle: unknown) {
  const server = new McpServer({ name: 'test', version: '1.0.0' })
  const kit = createCardServerKit({ manifest: cards, bundle: kitBundle })
  kit.registerResources(server)
  kit.registerTool(server, 'say_hello', {
    card: 'hello-card',
    description: 'Say hello',
    inputSchema: z.object({ name: z.string() }),
  }, async ({ name }: { name: string }) => kit.result('hello-card', { name }, `Said hello to ${name}.`))
  kit.registerTool(server, 'wave_back', {
    card: 'hello-card',
    visibility: ['app'],
    description: 'Only the card calls this',
    inputSchema: z.object({}),
  }, async () => kit.result('hello-card', { name: 'again' }))
  kit.registerTool(server, 'show_unbuilt', { card: 'unbuilt-card', description: 'x' }, async () => kit.result('unbuilt-card', {}))

  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(b)
  const client = new Client({ name: 'host', version: '1.0.0' }, { capabilities: { extensions: { [MCP_APPS_EXTENSION]: { mimeTypes: [MCP_APP_MIME] } } } })
  await client.connect(a)
  return { client, kit }
}

describe('createCardServerKit', () => {
  it('lists one ui:// template per built card, with its _meta', async () => {
    const { client } = await connect(bundle)
    const { resources } = await client.listResources()
    expect(resources.map(r => r.uri)).toEqual(['ui://cards/hello-card'])
    expect(resources[0]).toMatchObject({ mimeType: MCP_APP_MIME, title: 'Hello' })
    expect(resources[0]!._meta).toEqual({ ui: { csp: { connectDomains: ['https://api.example.com'], resourceDomains: [] }, prefersBorder: true } })
  })

  it('points tools at their template; app-only tools carry visibility', async () => {
    const { client } = await connect(bundle)
    const { tools } = await client.listTools()
    const byName = Object.fromEntries(tools.map(t => [t.name, t]))
    expect(byName.say_hello!._meta).toEqual({ ui: { resourceUri: 'ui://cards/hello-card' }, 'ui/resourceUri': 'ui://cards/hello-card' })
    expect(byName.wave_back!._meta).toMatchObject({ ui: { resourceUri: 'ui://cards/hello-card', visibility: ['app'] } })
    // A card that is declared but not built gets no template: hosts fall back to text.
    expect(byName.show_unbuilt!._meta).toBeUndefined()
  })

  it('serves a self-contained template', async () => {
    const { client } = await connect(bundle)
    const read = await client.readResource({ uri: 'ui://cards/hello-card' })
    const content = read.contents[0] as { text: string; mimeType: string }
    expect(content.mimeType).toBe(MCP_APP_MIME)
    expect(content.text).toContain('<div data-mcp-card="hello-card"></div>')
    // Inline code cannot close its own tag.
    expect(content.text).not.toContain('</script><!--')
    expect(content.text).toContain('<\\/script>')
    expect(content.text).toContain('<\\/style>')
    expect(content.text).not.toMatch(/<script[^>]+src=/)
    expect(content.text).not.toMatch(/<link[^>]+href=/)
  })

  it('returns the card in structuredContent and text for the model', async () => {
    const { client } = await connect(bundle)
    const result = await client.callTool({ name: 'say_hello', arguments: { name: 'Ada' } })
    expect(result.content).toEqual([{ type: 'text', text: 'Said hello to Ada.' }])
    expect(result.structuredContent).toEqual({ card: { name: 'hello-card', props: { name: 'Ada' } } })
  })

  it('runs text-only without a bundle', async () => {
    const { client, kit } = await connect(null)
    expect(kit.bundle).toBeNull()
    expect((await client.listResources()).resources).toEqual([])
    const { tools } = await client.listTools()
    expect(tools.find(t => t.name === 'say_hello')!._meta).toBeUndefined()
    expect(tools.find(t => t.name === 'wave_back')!._meta).toEqual({ ui: { visibility: ['app'] } })
  })

  it('refuses a tool that names an unknown card', () => {
    const kit = createCardServerKit({ manifest: cards, bundle })
    expect(() => kit.registerTool({ registerTool() {}, registerResource() {} }, 'x', { card: 'nope-card' }, () => {})).toThrow(/unknown card/)
  })
})

describe('helpers', () => {
  it('asCardBundle rejects empty or malformed bundles', () => {
    expect(asCardBundle(null)).toBeNull()
    expect(asCardBundle({ script: '', cards: [] })).toBeNull()
    expect(asCardBundle({ script: 'x', cards: ['a-b'] })).toEqual({ script: 'x', cards: ['a-b'], css: '' })
  })

  it('cardTemplateHtml escapes the title and refuses unknown cards', () => {
    const html = cardTemplateHtml(asCardBundle(bundle)!, 'hello-card', { title: '<b>"x"</b>' })
    expect(html).toContain('<title>&#60;b&#62;&#34;x&#34;&#60;/b&#62;</title>')
    expect(() => cardTemplateHtml(asCardBundle(bundle)!, 'other-card')).toThrow(/no "other-card"/)
  })

  it('inlineSafe', () => {
    expect(inlineSafe('a</SCRIPT>b<!--c</style>')).toBe('a<\\/SCRIPT>b<\\!--c<\\/style>')
  })

  it('cardResult default text', () => {
    expect(cardResult('hello-card', {}).content).toEqual([{ type: 'text', text: 'Showed the "hello-card" card to the user.' }])
  })
})
