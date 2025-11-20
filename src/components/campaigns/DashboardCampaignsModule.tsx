"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getUserCampaigns } from '@/lib/api';
import type { Campaign, CampaignProgressStatus, UserCampaignListItem } from '@/types';

const campaignStatusBadge: Record<Campaign['status'], string> = {
  draft: 'bg-secondary',
  active: 'bg-success',
  paused: 'bg-warning text-dark',
  archived: 'bg-dark'
};

const campaignStatusLabel: Record<Campaign['status'], string> = {
  draft: 'Borrador',
  active: 'Activa',
  paused: 'Pausada',
  archived: 'Archivada'
};

const evaluationStatusBadge: Record<CampaignProgressStatus, { className: string; label: string }> = {
  not_eligible: { className: 'badge bg-secondary', label: 'No elegible' },
  eligible: { className: 'badge bg-info text-dark', label: 'Elegible' },
  completed: { className: 'badge bg-success', label: 'Meta cumplida' }
};

function parseDateRange(value?: string | null): { start: Date | null; end: Date | null } {
  if (!value) return { start: null, end: null };
  const match = value.match(/^\[(.*?),(.*?)\)$/);
  if (!match) return { start: null, end: null };
  const [startRaw, endRaw] = match.slice(1);
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  return { start: Number.isNaN(start?.getTime()) ? null : start, end: Number.isNaN(end?.getTime()) ? null : end };
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short' }).format(value);
}

interface DashboardCampaignsModuleProps {
  maxItems?: number;
}

export default function DashboardCampaignsModule({ maxItems = 6 }: DashboardCampaignsModuleProps) {
  const router = useRouter();
  const [items, setItems] = useState<UserCampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCampaigns() {
      setError(null);
      setLoading(true);
      try {
        const data = await getUserCampaigns({ includeUpcoming: false });
        setItems(data.slice(0, maxItems));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'No se pudieron cargar las campañas';
        setError(message);
        setItems([]);
      } finally {
        setLoading(false);
      }
    }
    void fetchCampaigns();
  }, [maxItems]);

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Cargando campañas...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-warning mb-0" role="alert">
        {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="alert alert-info mb-0">
        No tienes campañas disponibles en este momento.
      </div>
    );
  }

  return (
    <div className="row g-3">
      {items.map(item => {
        const { campaign, evaluation } = item;
        const range = parseDateRange(campaign.active_range);
        const startLabel = formatDate(range.start);
        const endLabel = formatDate(range.end);
        const statusBadge = campaignStatusBadge[campaign.status] ?? 'bg-secondary';
        const statusLabel = campaignStatusLabel[campaign.status] ?? campaign.status;
        const evalMeta = evaluationStatusBadge[evaluation.status] ?? evaluationStatusBadge.eligible;
        const progressPercent = Math.round(Math.max(0, Math.min(1, evaluation.progress)) * 100);

        return (
          <div key={campaign.id} className="col-12 col-md-6 col-xl-4">
            <div
              className="card h-100 shadow-sm cursor-pointer campaign-card"
              onClick={() => router.push(`/campanias/${campaign.slug}`)}
              style={{ cursor: 'pointer', transition: 'transform 0.2s, box-shadow 0.2s' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 .5rem 1rem rgba(0,0,0,.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 .125rem .25rem rgba(0,0,0,.075)';
              }}
            >
              <div className="card-body d-flex flex-column gap-2">
                <div className="d-flex justify-content-between align-items-start gap-2">
                  <h6 className="card-title mb-0 fw-semibold">{campaign.name}</h6>
                  <span className={`badge ${statusBadge}`}>{statusLabel}</span>
                </div>

                {campaign.summary ? (
                  <p className="card-text small text-muted mb-0" style={{ 
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}>
                    {campaign.summary}
                  </p>
                ) : null}

                <div className="d-flex align-items-center gap-2">
                  <span className={evalMeta.className}>{evalMeta.label}</span>
                  <span className="badge bg-light text-dark">{progressPercent}%</span>
                </div>

                <div className="progress" style={{ height: '6px' }}>
                  <div
                    className={`progress-bar ${
                      evaluation.status === 'completed' ? 'bg-success' :
                      evaluation.status === 'eligible' ? 'bg-info' :
                      'bg-secondary'
                    }`}
                    role="progressbar"
                    style={{ width: `${progressPercent}%` }}
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  ></div>
                </div>

                {startLabel && endLabel ? (
                  <div className="small text-muted mt-auto">
                    <i className="bi bi-calendar-range me-1"></i>
                    {startLabel} — {endLabel}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
      
      {items.length >= maxItems && (
        <div className="col-12 text-center mt-3">
          <button
            type="button"
            className="btn btn-outline-primary btn-sm"
            onClick={() => router.push('/campanias')}
          >
            Ver todas las campañas
          </button>
        </div>
      )}
    </div>
  );
}
