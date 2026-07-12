import type { IntegrationProviderKey } from '@/types'

export function providerLabel(provider: IntegrationProviderKey): string {
  switch (provider) {
    case 'google':
      return 'Google Calendar'
    case 'zoom':
      return 'Zoom personal'
    case 'teams':
      return 'Microsoft Teams'
    case 'calcom':
      return 'Cal.com'
    case 'sendpilot':
      return 'SendPilot'
    default:
      return provider
  }
}
