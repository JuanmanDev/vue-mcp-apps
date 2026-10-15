/** Card name → Vue component. Imported by the view bundle and by native hosts (the playground). */
import type { Component } from 'vue'
import WeatherCard from './cards/WeatherCard.vue'
import ApprovalCard from './cards/ApprovalCard.vue'
import PollCard from './cards/PollCard.vue'
import type { DemoCardName } from './manifest'

export const components: Record<DemoCardName, Component> = {
  'weather-card': WeatherCard,
  'approval-card': ApprovalCard,
  'poll-card': PollCard,
}
