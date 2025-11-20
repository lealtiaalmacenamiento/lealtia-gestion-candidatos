import type { CampaignProgressStatus } from '@/types'

interface CampaignProgressBarProps {
  value: number
  target?: number
  status?: CampaignProgressStatus
  showLabel?: boolean
}

const statusClassMap: Record<CampaignProgressStatus, string> = {
  not_eligible: 'bg-secondary',
  eligible: 'bg-info',
  completed: 'bg-success'
}

const statusLabelMap: Record<CampaignProgressStatus, string> = {
  not_eligible: 'No elegible',
  eligible: 'Elegible',
  completed: 'Meta cumplida'
}

export default function CampaignProgressBar({ value, target = 100, status = 'eligible', showLabel = true }: CampaignProgressBarProps) {
  const safeTarget = target > 0 ? target : 1
  const percentage = Math.max(0, Math.min(100, Math.round((value / safeTarget) * 100)))
  const statusClass = statusClassMap[status] || 'bg-info'
  const statusLabel = statusLabelMap[status] || ''

  return (
    <div>
      <div className="progress" style={{ height: 10 }}>
        <div
          className={`progress-bar ${statusClass}`}
          role="progressbar"
          style={{ width: `${percentage}%` }}
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        ></div>
      </div>
      {showLabel && (
        <div className="d-flex justify-content-between align-items-center mt-1 small text-muted">
          <span>{statusLabel}</span>
          <span>{value.toLocaleString('es-MX')} / {safeTarget.toLocaleString('es-MX')}</span>
        </div>
      )}
    </div>
  )
}
