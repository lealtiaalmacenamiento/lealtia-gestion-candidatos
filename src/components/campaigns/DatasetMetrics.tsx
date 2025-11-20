import { Fragment } from 'react'
import type { CampaignEvaluationMetrics } from '@/types'

const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })
const percentFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 })

const PERCENT_HINTS = ['indice', 'porcentaje', 'percent', 'ratio', 'vigencia', 'momentum', 'permanencia']

function humanizeToken(token: string): string {
  return token
    .split(/[_-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function looksLikePercent(key: string): boolean {
  const lowered = key.toLowerCase()
  return PERCENT_HINTS.some(hint => lowered.includes(hint))
}

function formatMetricValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '—'
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (looksLikePercent(key)) {
      const scaled = Math.abs(value) <= 1 ? value * 100 : value
      return `${percentFormatter.format(scaled)}%`
    }
    if (Number.isInteger(value)) {
      return value.toLocaleString('es-MX')
    }
    return numberFormatter.format(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No'
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length === 0) return '—'
    const parsed = Number(trimmed)
    if (!Number.isNaN(parsed)) {
      return formatMetricValue(key, parsed)
    }
    return trimmed
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(item => formatMetricValue(key, item)).join(', ') : '—'
  }
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

interface DatasetMetricsProps {
  datasets: NonNullable<CampaignEvaluationMetrics['datasets']>
}

export default function DatasetMetrics({ datasets }: DatasetMetricsProps) {
  const entries = Object.entries(datasets)
  if (entries.length === 0) {
    return null
  }
  return (
    <div className="d-flex flex-column gap-3">
      {entries.map(([datasetKey, metrics]) => {
        const metricEntries = Object.entries(metrics ?? {})
        return (
          <div key={datasetKey} className="border rounded p-3 bg-light">
            <h6 className="text-uppercase small text-muted mb-2">{humanizeToken(datasetKey)}</h6>
            {metricEntries.length === 0 ? (
              <div className="text-muted small">Sin métricas registradas.</div>
            ) : (
              <dl className="row mb-0">
                {metricEntries.map(([metricKey, value]) => (
                  <Fragment key={`${datasetKey}-${metricKey}`}>
                    <dt className="col-6 col-md-4 small text-capitalize">
                      {humanizeToken(metricKey)}
                    </dt>
                    <dd className="col-6 col-md-8 small text-muted mb-0">
                      {formatMetricValue(metricKey, value)}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            )}
          </div>
        )
      })}
    </div>
  )
}
