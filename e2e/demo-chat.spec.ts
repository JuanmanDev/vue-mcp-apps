/**
 * The AI demo: an assistant (scripted here, so CI is deterministic; and an
 * OpenAI-compatible endpoint, mocked) calls MCP tools, the cards appear in the
 * chat as sandboxed MCP Apps, and card buttons talk back to the assistant.
 */
import { expect, test } from '@playwright/test'
import { connected, mcpView } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.goto('./')
  await connected(page)
})

const chat = (page: import('@playwright/test').Page) => page.getByTestId('chat-log')

test('scripted assistant: weather card, then a card button asks the assistant', async ({ page }) => {
  await page.getByRole('button', { name: 'Weather in Oslo' }).click()
  const view = mcpView(page)
  await expect(view.getByText('Oslo', { exact: true })).toBeVisible()
  await expect(chat(page).getByText(/Oslo: -?\d+°C/)).toBeVisible()

  // ui/message from the card becomes a user turn, which the assistant answers.
  await view.getByRole('button', { name: 'Ask what to pack' }).click()
  await expect(chat(page).getByText('from a card button (ui/message)')).toBeVisible()
  await expect(chat(page).getByText(/For Oslo, pack/)).toBeVisible()
})

test('human in the loop: the model proposes, the card applies', async ({ page }) => {
  await page.getByRole('button', { name: 'Approve booking changes' }).click()
  const view = mcpView(page)
  await expect(view.getByText('Update booking #4821')).toBeVisible()
  await expect(view.getByText('Breakfast')).toBeVisible()
  await view.getByRole('button', { name: /Apply 3 of 3/ }).click()
  await expect(view.getByText('3 of 3 change(s) applied')).toBeVisible()
  await expect(chat(page).getByText(/Card → model context: .*apply_changes/)).toBeVisible()
})

test('a new poll from free text, voted inside the card', async ({ page }) => {
  await page.getByPlaceholder(/Ask for the weather/).fill('Make a poll: pizza, sushi or tacos?')
  await page.keyboard.press('Enter')
  const view = mcpView(page)
  await expect(view.getByText('Pizza, sushi or tacos?')).toBeVisible()
  await view.getByRole('button', { name: 'Sushi' }).click()
  await expect(view.getByText(/^1 · 100%/)).toBeVisible()
})

test('cards can render natively instead of sandboxed', async ({ page }) => {
  await page.getByRole('button', { name: 'Native' }).click()
  await page.getByRole('button', { name: 'Lunch poll' }).click()
  await expect(chat(page).getByText('Where do we go for lunch on Friday?')).toBeVisible()
  await expect(page.locator('iframe[title="Sandbox proxy"]')).toHaveCount(0)
})

test('Chrome built-in AI: picked automatically when the model is on the device (mocked Prompt API)', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  // A stand-in for Chrome's `LanguageModel` (Gemini Nano) with the real API shape.
  await page.addInitScript(() => {
    const prompts: string[] = []
    ;(window as unknown as { __prompts: string[] }).__prompts = prompts
    const session = {
      async prompt(input: string, options?: { responseConstraint?: { properties?: { tool?: { enum?: string[] } } } }) {
        prompts.push(input)
        const enumTools = options?.responseConstraint?.properties?.tool?.enum ?? []
        if (input.includes('TOOL get_weather RESULT')) return JSON.stringify({ text: 'Chilly in Reykjavik — bring layers.' })
        if (!enumTools.includes('get_weather') || enumTools.includes('apply_changes')) return JSON.stringify({ action: 'answer', text: 'bad tool list' })
        return JSON.stringify({ action: 'call_tool', tool: 'get_weather', arguments: { city: 'Reykjavik' } })
      },
      async clone() { return session },
      destroy() {},
    }
    ;(window as unknown as { LanguageModel: unknown }).LanguageModel = {
      async availability() { return 'available' },
      async create() { return session },
    }
  })
  await page.goto('./')
  await connected(page)
  await expect(page.getByText('Chrome built-in AI is ready.')).toBeVisible()
  await page.getByPlaceholder(/Ask for the weather/).fill('How is the weather in Reykjavik?')
  await page.keyboard.press('Enter')
  await expect(mcpView(page).getByText('Reykjavik', { exact: true })).toBeVisible()
  await expect(chat(page).getByText('Chilly in Reykjavik — bring layers.')).toBeVisible()
  await context.close()
})

test('OpenAI-compatible provider: native tool calling (mocked endpoint)', async ({ page }) => {
  let calls = 0
  await page.route('http://localhost:11434/v1/models', route => route.fulfill({ json: { data: [{ id: 'mock' }] } }))
  await page.route('http://localhost:11434/v1/chat/completions', async (route) => {
    const body = route.request().postDataJSON() as { tools?: Array<{ function: { name: string } }> }
    calls++
    if (body.tools) {
      // The model only sees tools the model may call — never the app-only ones.
      const names = body.tools.map(t => t.function.name)
      expect(names).toContain('get_weather')
      expect(names).not.toContain('apply_changes')
      expect(names).not.toContain('cast_vote')
      return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Lisbon","unit":"F"}' } }] } }] } })
    }
    return route.fulfill({ json: { choices: [{ message: { role: 'assistant', content: 'Lisbon looks fine — check the card.' } }] } })
  })

  await page.getByRole('radio', { name: /OpenAI-compatible/ }).click()
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByText('OpenAI-compatible is ready.')).toBeVisible()
  await page.getByPlaceholder(/Ask for the weather/).fill('Weather in Lisbon please, in F')
  await page.keyboard.press('Enter')
  await expect(mcpView(page).getByText('Lisbon', { exact: true })).toBeVisible()
  await expect(chat(page).getByText('Lisbon looks fine — check the card.')).toBeVisible()
  expect(calls).toBe(2)
})
