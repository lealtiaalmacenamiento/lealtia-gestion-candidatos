// Cliente mínimo para enviar eventos de UI al historial de acciones sin bloquear la UI.
// Intenta navigator.sendBeacon y cae a fetch keepalive.

export type UIAuditPayload = {
  action: string
  snapshot?: Record<string, unknown> | undefined
}

export function logUI(action: string, snapshot?: Record<string, unknown>) {
  try {
    const url = '/api/auditoria/log'
    const body = JSON.stringify({ action, snapshot } as UIAuditPayload)
    const blob = new Blob([body], { type: 'application/json' })
    type BeaconNavigator = Navigator & { sendBeacon?: (url: string | URL, data?: BodyInit | null) => boolean }
    const nav = (typeof navigator !== 'undefined' ? (navigator as BeaconNavigator) : undefined)
    if (nav && typeof nav.sendBeacon === 'function') {
      nav.sendBeacon(url, blob)
      return
    }
    // Fallback: fetch con keepalive para no bloquear navegación
    fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(() => {})
  } catch {
    // swallow
  }
}

// Utilidades de conveniencia
export const logPageView = (path?: string) => logUI('ui_page_view', path ? { path } : undefined)
export const logClick = (meta: Record<string, unknown>) => logUI('ui_click', meta)
export const logFormSubmit = (meta: Record<string, unknown>) => logUI('ui_form_submit', meta)
