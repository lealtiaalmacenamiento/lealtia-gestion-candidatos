"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import BasePage from '@/components/BasePage';
import CampaignCard from '@/components/campaigns/CampaignCard';
import CampaignWizard, { type CampaignWizardInitialData, type WizardMode } from './CampaignWizard';
import ParticipantsModal from '@/components/campaigns/ParticipantsModal';
import { useDialog } from '@/components/ui/DialogProvider';
import { getAdminCampaignDetail, getAdminCampaignProgressSummary, getAdminCampaigns, getAdminSegments } from '@/lib/api';
import type { Campaign, CampaignProgressSummary, Segment } from '@/types';

type NotificationType = 'success' | 'danger' | 'info' | 'warning';
type NotificationState = { type: NotificationType; message: string } | null;

export default function AdminCampaignsView() {
  const dialog = useDialog();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<NotificationState>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [segmentFilter, setSegmentFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>('create');
  const [wizardInitialData, setWizardInitialData] = useState<CampaignWizardInitialData | undefined>(undefined);
  const [actionCampaignId, setActionCampaignId] = useState<string | null>(null);
  const [progressByCampaign, setProgressByCampaign] = useState<Record<string, CampaignProgressSummary>>({});
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [showParticipantsModal, setShowParticipantsModal] = useState<'eligible' | 'completed' | null>(null);

  const handleNotify = useCallback((message: string, type: NotificationType) => {
    setNotif({ type, message });
  }, []);

  const handleCampaignCreated = (campaign: Campaign) => {
    setCampaigns(prev => {
      const without = prev.filter(item => item.id !== campaign.id);
      return [campaign, ...without];
    });
    setStatusFilter(campaign.status);
    void refreshCampaignProgress(campaign.id);
  };

  const handleCampaignUpdated = (campaign: Campaign) => {
    setCampaigns(prev => prev.map(item => (item.id === campaign.id ? campaign : item)));
    setStatusFilter(campaign.status);
    void refreshCampaignProgress(campaign.id);
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    setWizardInitialData(undefined);
    setWizardMode('create');
    setActionCampaignId(null);
  };

  const openCreateWizard = () => {
    setWizardMode('create');
    setWizardInitialData(undefined);
    setShowWizard(true);
  };

  const openWizardForCampaign = async (campaign: Campaign, mode: WizardMode) => {
    setActionCampaignId(campaign.id);
    try {
      const detail = await getAdminCampaignDetail(campaign.id);
      setWizardMode(mode);
      setWizardInitialData(detail);
      setShowWizard(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar el detalle de la campaña';
      handleNotify(message, 'danger');
    } finally {
      setActionCampaignId(null);
    }
  };

  const loadProgressSummaries = useCallback(async (campaignList: Campaign[]) => {
    if (campaignList.length === 0) return;
    setLoadingProgress(true);
    try {
      const results = await Promise.allSettled(
        campaignList.map(async campaign => {
          const summary = await getAdminCampaignProgressSummary(campaign.id);
          return { id: campaign.id, summary };
        })
      );
      const next: Record<string, CampaignProgressSummary> = {};
      results.forEach(result => {
        if (result.status === 'fulfilled') {
          next[result.value.id] = result.value.summary;
        }
      });
      setProgressByCampaign(next);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los avances de las campañas';
      handleNotify(message, 'danger');
    } finally {
      setLoadingProgress(false);
    }
  }, [handleNotify]);

  const refreshCampaignProgress = useCallback(async (campaignId: string) => {
    try {
      const summary = await getAdminCampaignProgressSummary(campaignId);
      setProgressByCampaign(prev => ({ ...prev, [campaignId]: summary }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo actualizar el avance de la campaña';
      handleNotify(message, 'warning');
    }
  }, [handleNotify]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [campaignList, segmentList] = await Promise.all([
          getAdminCampaigns(),
          getAdminSegments()
        ]);
        setCampaigns(campaignList);
        setSegments(segmentList);
        void loadProgressSummaries(campaignList);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudieron cargar las campañas';
        handleNotify(message, 'danger');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [handleNotify, loadProgressSummaries]);

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter(campaign => {
      const matchesStatus = statusFilter ? campaign.status === statusFilter : true;
      const matchesSegment = segmentFilter ? campaign.primary_segment_id === segmentFilter : true;
      const term = searchTerm.trim().toLowerCase();
      const matchesSearch = term
        ? [campaign.name, campaign.slug, campaign.summary ?? '', campaign.description ?? '']
            .some(value => value?.toLowerCase().includes(term))
        : true;
      return matchesStatus && matchesSegment && matchesSearch;
    });
  }, [campaigns, statusFilter, segmentFilter, searchTerm]);

  const aggregateProgress = useMemo(() => {
    return filteredCampaigns.reduce(
      (acc, campaign) => {
        const summary = progressByCampaign[campaign.id];
        if (summary) {
          acc.eligible += summary.eligibleTotal ?? 0;
          acc.completed += summary.completedTotal ?? 0;
          acc.total += summary.total ?? 0;
        }
        return acc;
      },
      { eligible: 0, completed: 0, total: 0 }
    );
  }, [filteredCampaigns, progressByCampaign]);

  const buildProgressProps = useCallback((campaignId: string) => {
    const summary = progressByCampaign[campaignId];
    if (!summary) {
      return { value: 0, target: 100, status: 'eligible' as const };
    }
    const target = summary.eligibleTotal || summary.total || 100;
    const value = Math.min(summary.completedTotal ?? 0, target || 0);
    let status: 'eligible' | 'completed' | 'not_eligible' = 'eligible';
    if (!summary.eligibleTotal) status = 'not_eligible';
    if (summary.eligibleTotal && value >= summary.eligibleTotal) status = 'completed';
    return { value, target: target || 100, status };
  }, [progressByCampaign]);

  return (
    <BasePage title="Campañas" alert={notif ? { type: notif.type, message: notif.message, show: true } : undefined}>
      <div className="d-flex flex-column gap-4">
        <div className="border rounded p-3 bg-white shadow-sm">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-md-3">
              <label className="form-label small mb-1">Buscar</label>
              <input
                className="form-control form-control-sm"
                placeholder="Nombre, slug o descripción"
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1">Estado</label>
              <select className="form-select form-select-sm" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                <option value="">Todos</option>
                <option value="active">Activas</option>
                <option value="paused">Pausadas</option>
                <option value="draft">Borradores</option>
                <option value="archived">Archivadas</option>
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1">Segmento</label>
              <select className="form-select form-select-sm" value={segmentFilter} onChange={event => setSegmentFilter(event.target.value)}>
                <option value="">Todos</option>
                {segments.map(segment => (
                  <option key={segment.id} value={segment.id}>{segment.name}</option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-3 text-end">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={openCreateWizard}
              >
                <i className="bi bi-plus-lg"></i> Crear campaña
              </button>
            </div>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-12 col-md-4">
            <div className="border rounded p-3 bg-white h-100 shadow-sm">
              <div className="small text-muted text-uppercase mb-1">Campañas visibles</div>
              <div className="fs-4 fw-semibold">{filteredCampaigns.length}</div>
            </div>
          </div>
          <div className="col-12 col-md-4">
            <button
              type="button"
              className="border rounded p-3 bg-white h-100 shadow-sm w-100 text-start btn btn-link text-decoration-none"
              onClick={() => setShowParticipantsModal('eligible')}
              disabled={loadingProgress || aggregateProgress.eligible === 0}
              style={{ cursor: aggregateProgress.eligible > 0 ? 'pointer' : 'default' }}
            >
              <div className="small text-muted text-uppercase mb-1">
                <i className="bi bi-people me-1"></i>
                Participantes elegibles
              </div>
              <div className="fs-4 fw-semibold d-flex align-items-center gap-2 text-dark">
                {loadingProgress ? (
                  <span className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Cargando…</span>
                  </span>
                ) : null}
                <span>{aggregateProgress.eligible}</span>
                {aggregateProgress.eligible > 0 && (
                  <i className="bi bi-box-arrow-up-right fs-6 text-primary"></i>
                )}
              </div>
            </button>
          </div>
          <div className="col-12 col-md-4">
            <button
              type="button"
              className="border rounded p-3 bg-white h-100 shadow-sm w-100 text-start btn btn-link text-decoration-none"
              onClick={() => setShowParticipantsModal('completed')}
              disabled={loadingProgress || aggregateProgress.completed === 0}
              style={{ cursor: aggregateProgress.completed > 0 ? 'pointer' : 'default' }}
            >
              <div className="small text-muted text-uppercase mb-1">
                <i className="bi bi-trophy me-1"></i>
                Objetivos cumplidos
              </div>
              <div className="fs-4 fw-semibold d-flex align-items-center gap-2 text-dark">
                {loadingProgress ? (
                  <span className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Cargando…</span>
                  </span>
                ) : null}
                <span>{aggregateProgress.completed}</span>
                {aggregateProgress.completed > 0 && (
                  <i className="bi bi-box-arrow-up-right fs-6 text-success"></i>
                )}
              </div>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Cargando…</span>
            </div>
          </div>
        ) : filteredCampaigns.length === 0 ? (
          <div className="alert alert-info">No se encontraron campañas con los filtros seleccionados.</div>
        ) : (
          <div className="row g-3">
            {filteredCampaigns.map(campaign => (
              <div key={campaign.id} className="col-12 col-md-6 col-xl-4">
                <CampaignCard
                  campaign={campaign}
                  progress={buildProgressProps(campaign.id)}
                  progressSummary={progressByCampaign[campaign.id]}
                  onViewDetail={selected => {
                    dialog.alert(
                      <div>
                        <p className="mb-1"><strong>{selected.name}</strong></p>
                        <p className="mb-0 small text-muted">Slug: {selected.slug}</p>
                      </div>
                    );
                  }}
                  onEdit={selected => void openWizardForCampaign(selected, 'edit')}
                  onDuplicate={selected => void openWizardForCampaign(selected, 'duplicate')}
                  disabled={actionCampaignId === campaign.id || loadingProgress}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {showWizard && (
        <CampaignWizard
          mode={wizardMode}
          segments={segments}
          onClose={handleWizardClose}
          onCreated={handleCampaignCreated}
          onUpdated={handleCampaignUpdated}
          onNotify={handleNotify}
          initialData={wizardInitialData}
        />
      )}

      {showParticipantsModal && (
        <ParticipantsModal
          type={showParticipantsModal}
          campaignIds={filteredCampaigns.map(c => c.id)}
          onClose={() => setShowParticipantsModal(null)}
        />
      )}
    </BasePage>
  );
}
