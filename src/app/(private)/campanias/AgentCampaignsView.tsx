"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BasePage from '@/components/BasePage';
import CampaignProgressBar from '@/components/campaigns/CampaignProgressBar';
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
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(value);
}

function formatDateTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function buildSegmentsLabel(item: UserCampaignListItem): string {
  const labels: string[] = [];
  if (item.segments.primary) {
    labels.push(item.segments.primary.name);
  }
  for (const segment of item.segments.additional) {
    if (segment && segment.name) {
      labels.push(segment.name);
    }
  }
  return labels.length > 0 ? labels.join(', ') : 'Todos los segmentos';
}

export default function AgentCampaignsView() {
  const router = useRouter();
  const [items, setItems] = useState<UserCampaignListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchCampaigns = useCallback(async (options?: { silent?: boolean }) => {
    setError(null);
    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await getUserCampaigns({ includeUpcoming: false });
      setItems(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudieron cargar las campañas';
      setError(message);
      if (!options?.silent) {
        setItems([]);
      }
    } finally {
      if (options?.silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchCampaigns();
  }, [fetchCampaigns]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter(item => {
      const { campaign } = item;
      return campaign.name.toLowerCase().includes(term);
    });
  }, [items, searchTerm]);

  return (
    <BasePage title="Campañas">
      <div className="d-flex flex-column gap-4">
        <div className="border rounded p-3 bg-white shadow-sm">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-8">
              <label className="form-label small mb-1" htmlFor="campaign-search">Buscar</label>
              <input
                id="campaign-search"
                className="form-control form-control-sm"
                placeholder="Nombre de la campaña"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="col-12 col-md-4 text-end">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => void fetchCampaigns({ silent: true })}
                disabled={refreshing || loading}
              >
                {refreshing ? (
                  <span className="spinner-border spinner-border-sm me-2" role="status">
                    <span className="visually-hidden">Actualizando…</span>
                  </span>
                ) : (
                  <i className="bi bi-arrow-repeat me-2"></i>
                )}
                Actualizar
              </button>
            </div>
          </div>
        </div>

        {error ? <div className="alert alert-danger" role="alert">{error}</div> : null}

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Cargando…</span>
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="alert alert-info">No tienes campañas disponibles en este momento.</div>
        ) : (
          <div className="row g-3">
            {filteredItems.map(item => {
              const { campaign, evaluation, cache } = item;
              const range = parseDateRange(campaign.active_range);
              const startLabel = formatDate(range.start);
              const endLabel = formatDate(range.end);
              const statusBadge = campaignStatusBadge[campaign.status] ?? 'bg-secondary';
              const statusLabel = campaignStatusLabel[campaign.status] ?? campaign.status;
              const evalMeta = evaluationStatusBadge[evaluation.status] ?? evaluationStatusBadge.eligible;
              const progressPercent = Math.round(Math.max(0, Math.min(1, evaluation.progress)) * 100);
              const segmentsLabel = buildSegmentsLabel(item);
              const evaluatedAtLabel = formatDateTime(cache.snapshotEvaluatedAt);

              return (
                <div key={campaign.id} className="col-12 col-md-6 col-xl-4">
                  <div className="card h-100 shadow-sm">
                    <div className="card-body d-flex flex-column gap-3">
                      <div className="d-flex justify-content-between align-items-start gap-3">
                        <div>
                          <h5 className="card-title mb-1">{campaign.name}</h5>
                          {campaign.summary ? <p className="card-text small text-muted mb-0">{campaign.summary}</p> : null}
                        </div>
                        <span className={`badge ${statusBadge}`}>{statusLabel}</span>
                      </div>

                      <div className="d-flex align-items-center gap-2">
                        <span className={evalMeta.className}>{evalMeta.label}</span>
                        <span className="small text-muted">Progreso {progressPercent}%</span>
                      </div>

                      <CampaignProgressBar value={progressPercent} target={100} status={evaluation.status} showLabel={false} />

                      <div className="small text-muted">
                        Vigencia: {startLabel && endLabel ? `${startLabel} — ${endLabel}` : (startLabel || endLabel || 'No definida')}
                      </div>

                      <div className="small text-muted">Segmentos objetivo: {segmentsLabel}</div>

                      {evaluatedAtLabel ? (
                        <div className="small text-muted">Última evaluación: {evaluatedAtLabel}</div>
                      ) : null}

                      <div className="mt-auto d-flex justify-content-between align-items-center">
                        <div className="small text-muted">Slug: {campaign.slug}</div>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => router.push(`/campanias/${campaign.slug}`)}
                        >
                          Ver detalle
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </BasePage>
  );
}
