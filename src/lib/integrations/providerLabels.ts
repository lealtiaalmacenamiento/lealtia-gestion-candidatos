import type { IntegrationProviderKey } from '@/types'

export function providerLabel(provider: IntegrationProviderKey): string {
  switch (provider) {
    case 'google':
      return 'Google Calendar'
    case 'zoom':
      return 'Zoom personal'
    default:
      return provider
  }
}
