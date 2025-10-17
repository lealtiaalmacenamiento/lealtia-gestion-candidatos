import type { IntegrationProviderKey } from '@/types'

export function providerLabel(provider: IntegrationProviderKey): string {
  switch (provider) {
    case 'google':
      return 'Google Calendar'
    case 'microsoft':
      return 'Microsoft 365'
    case 'zoom':
      return 'Zoom Meetings'
    default:
      return provider
  }
}
