"use client";

import { useEffect, useState } from 'react';

interface ParticipantDetail {
  usuario_id: number;
  nombre: string;
  email: string;
  rol: string;
  campaign_id: string;
  campaign_name: string;
  campaign_slug: string;
  status: 'eligible' | 'completed' | 'not_eligible';
  progress: number;
}

interface ParticipantsModalProps {
  type: 'eligible' | 'completed';
  campaignIds: string[];
  onClose: () => void;
}

export default function ParticipantsModal({ type, campaignIds, onClose }: ParticipantsModalProps) {
  const [participants, setParticipants] = useState<ParticipantDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');

  useEffect(() => {
    async function loadParticipants() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          type,
          campaignIds: campaignIds.join(',')
        });
        const url = `/api/admin/campaigns/participants?${params}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error('No se pudieron cargar los participantes');
        }
        const data = await response.json();
        setParticipants(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    }
    void loadParticipants();
  }, [type, campaignIds]);

  const filteredParticipants = participants.filter(p => {
    const matchesSearch = searchTerm === '' || 
      p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCampaign = campaignFilter === '' || p.campaign_id === campaignFilter;
    return matchesSearch && matchesCampaign;
  });

  const uniqueCampaigns = Array.from(
    new Map(participants.map(p => [p.campaign_id, { id: p.campaign_id, name: p.campaign_name }])).values()
  );

  const title = type === 'eligible' ? 'Participantes Elegibles' : 'Objetivos Cumplidos';
  const badge = type === 'eligible' ? 'bg-info text-dark' : 'bg-success';

  return (
    <div className="modal show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className={`bi ${type === 'eligible' ? 'bi-people' : 'bi-trophy'} me-2`}></i>
              {title}
            </h5>
            <button type="button" className="btn-close" onClick={onClose}></button>
          </div>
          <div className="modal-body">
            {loading ? (
              <div className="text-center py-5">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Cargando...</span>
                </div>
              </div>
            ) : error ? (
              <div className="alert alert-danger">{error}</div>
            ) : (
              <>
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Buscar por nombre o email..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <div className="col-md-6">
                    <select
                      className="form-select form-select-sm"
                      value={campaignFilter}
                      onChange={e => setCampaignFilter(e.target.value)}
                    >
                      <option value="">Todas las campañas</option>
                      {uniqueCampaigns.map(campaign => (
                        <option key={campaign.id} value={campaign.id}>
                          {campaign.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="alert alert-light d-flex justify-content-between align-items-center">
                  <span>Total: <strong>{filteredParticipants.length}</strong> {type === 'eligible' ? 'elegibles' : 'completados'}</span>
                  {uniqueCampaigns.length > 1 && (
                    <span className="text-muted small">{uniqueCampaigns.length} campañas</span>
                  )}
                </div>

                {filteredParticipants.length === 0 ? (
                  <div className="text-muted text-center py-4">
                    No se encontraron participantes
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm table-hover">
                      <thead className="table-light">
                        <tr>
                          <th>Usuario</th>
                          <th>Email</th>
                          <th>Rol</th>
                          <th>Campaña</th>
                          <th className="text-center">Progreso</th>
                          <th className="text-center">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredParticipants.map((p, idx) => (
                          <tr key={`${p.usuario_id}-${p.campaign_id}-${idx}`}>
                            <td>{p.nombre}</td>
                            <td className="text-muted small">{p.email}</td>
                            <td>
                              <span className="badge bg-secondary">{p.rol}</span>
                            </td>
                            <td>
                              <div className="small">{p.campaign_name}</div>
                              <div className="text-muted" style={{ fontSize: '0.75rem' }}>{p.campaign_slug}</div>
                            </td>
                            <td className="text-center">
                              <span className="badge bg-light text-dark">
                                {Math.round(p.progress * 100)}%
                              </span>
                            </td>
                            <td className="text-center">
                              <span className={`badge ${badge}`}>
                                {type === 'eligible' ? 'Elegible' : 'Completado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
