import type { Campaign, CampaignProgressStatus, CampaignProgressSummary } from '@/types'

interface CampaignCardProps {
  campaign: Campaign
  progress?: {
    value: number
    target?: number
    status?: CampaignProgressStatus
  }
  onViewDetail?: (campaign: Campaign) => void
  onEdit?: (campaign: Campaign) => void
  onDuplicate?: (campaign: Campaign) => void
  disabled?: boolean
  progressSummary?: CampaignProgressSummary
}

const statusBadgeClass: Record<Campaign['status'], string> = {
  draft: 'bg-secondary',
  active: 'bg-success',
  paused: 'bg-warning text-dark',
  archived: 'bg-dark'
}

const statusLabel: Record<Campaign['status'], string> = {
  draft: 'Borrador',
  active: 'Activa',
  paused: 'Pausada',
  archived: 'Archivada'
}

function parseRange(range?: string | null): { start: Date | null; end: Date | null } {
  if (!range) return { start: null, end: null }
  const matches = range.match(/^\[(.*?),(.*?)\)$/)
  if (!matches) return { start: null, end: null }
  const [startRaw, endRaw] = matches.slice(1)
  const start = startRaw ? new Date(startRaw) : null
  const end = endRaw ? new Date(endRaw) : null
  return { start, end }
}

function formatDate(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date)
}

export default function CampaignCard({ campaign, progress: _progress, progressSummary, onViewDetail, onEdit, onDuplicate, disabled }: CampaignCardProps) {
  void _progress
  void progressSummary
  const range = parseRange(campaign.active_range)
  const startLabel = formatDate(range.start)
  const endLabel = formatDate(range.end)
  const badgeClass = statusBadgeClass[campaign.status] || 'bg-secondary'
  const badgeLabel = statusLabel[campaign.status] || campaign.status

  return (
    <div className="card shadow-sm h-100">
      <div className="card-body d-flex flex-column gap-3">
        <div className="d-flex justify-content-between align-items-start gap-3">
          <div>
            <h5 className="card-title mb-1">{campaign.name}</h5>
            <div className="small text-muted">Slug: {campaign.slug}</div>
          </div>
          <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
        </div>

        {campaign.summary && <p className="card-text small text-muted mb-0">{campaign.summary}</p>}

        <div className="small text-muted">
          Vigencia:{' '}
          {startLabel && endLabel ? `${startLabel} — ${endLabel}` : (startLabel || endLabel || 'No definida')}
        </div>

        <div className="d-flex justify-content-between align-items-center mt-auto gap-3">
          <div className="small text-muted">
            Actualizado el {formatDate(campaign.updated_at ? new Date(campaign.updated_at) : null) || '—'}
          </div>
          <div className="d-flex gap-2">
            {onDuplicate && (
              <button
                type="button"
                className="btn btn-outline-info btn-sm"
                onClick={() => onDuplicate(campaign)}
                disabled={disabled}
              >
                Duplicar
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => onEdit(campaign)}
                disabled={disabled}
              >
                Editar
              </button>
            )}
            {onViewDetail && (
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => onViewDetail(campaign)}
                disabled={disabled}
              >
                Ver detalle
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
