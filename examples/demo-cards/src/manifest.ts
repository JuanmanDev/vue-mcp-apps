/**
 * The demo cards — what each one is and what its buttons may ask for.
 *
 * Pure data: the MCP server, the view bundle, the playground and the tests all
 * import this file. A card's event that is not listed here asks for nothing,
 * and a `tool` action always runs the tool named here, whatever the card sends.
 */
import { defineCards } from '@vue-mcp-apps/core'

export const cards = defineCards({
  'weather-card': {
    title: 'Weather',
    description: 'Current weather and a three-day forecast for a city.',
    actions: {
      refresh: { kind: 'tool', tool: 'get_weather' },
      opened: { kind: 'link' },
      asked: { kind: 'message' },
    },
    propsSchema: {
      type: 'object',
      required: ['city', 'current'],
      properties: {
        city: { type: 'string' },
        country: { type: 'string' },
        unit: { type: 'string', enum: ['C', 'F'] },
        current: {
          type: 'object',
          properties: {
            temp: { type: 'number' },
            condition: { type: 'string', enum: ['sunny', 'cloudy', 'rain', 'storm', 'snow'] },
            humidity: { type: 'number' },
            wind: { type: 'number' },
          },
        },
        forecast: { type: 'array', items: { type: 'object' } },
        sourceUrl: { type: 'string', format: 'uri' },
      },
    },
    fixtures: {
      madrid: {
        city: 'Madrid',
        country: 'ES',
        unit: 'C',
        current: { temp: 24, condition: 'sunny', humidity: 31, wind: 12 },
        forecast: [
          { day: 'Fri', min: 14, max: 26, condition: 'sunny' },
          { day: 'Sat', min: 15, max: 23, condition: 'cloudy' },
          { day: 'Sun', min: 12, max: 19, condition: 'rain' },
        ],
        sourceUrl: 'https://en.wikipedia.org/wiki/Madrid',
      },
      oslo: {
        city: 'Oslo',
        country: 'NO',
        unit: 'C',
        current: { temp: -3, condition: 'snow', humidity: 82, wind: 20 },
        forecast: [
          { day: 'Fri', min: -6, max: -1, condition: 'snow' },
          { day: 'Sat', min: -4, max: 1, condition: 'cloudy' },
          { day: 'Sun', min: -8, max: -2, condition: 'storm' },
        ],
      },
    },
  },

  'approval-card': {
    title: 'Change approval',
    description: 'A list of proposed changes the user approves (all or some) or rejects.',
    actions: {
      approved: { kind: 'tool', tool: 'apply_changes' },
      rejected: { kind: 'notify', fallback: 'Changes rejected.' },
      explained: { kind: 'context' },
    },
    propsSchema: {
      type: 'object',
      required: ['title', 'changes'],
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        requestedBy: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'applied'] },
        applied: { type: 'array', items: { type: 'string' } },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'field', 'to'],
            properties: { id: { type: 'string' }, field: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } },
          },
        },
      },
    },
    fixtures: {
      booking: {
        title: 'Update booking #4821',
        summary: 'The guest asked by email to change their stay.',
        requestedBy: 'guest@example.com',
        status: 'pending',
        changes: [
          { id: 'c1', field: 'Check-in', from: '2026-11-02', to: '2026-11-03' },
          { id: 'c2', field: 'Guests', from: '2', to: '3' },
          { id: 'c3', field: 'Breakfast', from: 'No', to: 'Yes' },
        ],
      },
      applied: {
        title: 'Update booking #4821',
        status: 'applied',
        applied: ['c1', 'c3'],
        changes: [
          { id: 'c1', field: 'Check-in', from: '2026-11-02', to: '2026-11-03' },
          { id: 'c2', field: 'Guests', from: '2', to: '3' },
          { id: 'c3', field: 'Breakfast', from: 'No', to: 'Yes' },
        ],
      },
    },
  },

  'poll-card': {
    title: 'Poll',
    description: 'A quick poll: vote, see the results live.',
    actions: {
      voted: { kind: 'tool', tool: 'cast_vote' },
      discussed: { kind: 'message' },
    },
    propsSchema: {
      type: 'object',
      required: ['id', 'question', 'options'],
      properties: {
        id: { type: 'string' },
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' }, votes: { type: 'number' } } } },
        voted: { type: 'string' },
      },
    },
    fixtures: {
      lunch: {
        id: 'lunch',
        question: 'Where do we go for lunch on Friday?',
        options: [
          { id: 'tapas', label: 'Tapas bar', votes: 4 },
          { id: 'ramen', label: 'Ramen place', votes: 6 },
          { id: 'pizza', label: 'Pizzeria', votes: 2 },
        ],
      },
    },
  },
})

export type DemoCardName = keyof typeof cards
