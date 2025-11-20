"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import AppModal from '@/components/ui/AppModal';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  createAdminSegment,
  getAdminSegments,
  updateAdminSegment,
  getSegmentAssignments,
  updateSegmentAssignments,
  getUsuarios,
  updateAgendaDevelopers,
  type SegmentInput
} from '@/lib/api';
import type { Segment, Usuario } from '@/types';
import { segmentFormSchema, type SegmentFormValues } from '@/lib/validation/segmentSchemas';

type NotifyType = 'success' | 'danger' | 'info' | 'warning';

interface SegmentsSectionProps {
  onNotify: (message: string, type: NotifyType) => void;
}

const DEVELOPER_SEGMENT_KEYWORDS = ['desarrollador', 'desarrolladores'];

const isDeveloperSegment = (segment: Segment | null | undefined): boolean => {
  if (!segment?.name) return false;
  const normalized = segment.name.toLowerCase();
  return DEVELOPER_SEGMENT_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

export default function SegmentsSection({ onNotify }: SegmentsSectionProps) {
  const dialog = useDialog();
  const [openSegments, setOpenSegments] = useState(false);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; segment?: Segment } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [assignmentModal, setAssignmentModal] = useState<{ segment: Segment } | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [assignmentSelection, setAssignmentSelection] = useState<Set<number>>(new Set());
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [assignmentError, setAssignmentError] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<Usuario[] | null>(null);
  const [assignmentCounts, setAssignmentCounts] = useState<Record<string, number>>({});
  const [developerPrefillCount, setDeveloperPrefillCount] = useState(0);

  const segmentForm = useForm<SegmentFormValues>({
    resolver: zodResolver(segmentFormSchema),
    defaultValues: {
      name: '',
      description: '',
      active: true
    }
  });

  const {
    register: registerSegment,
    handleSubmit: submitSegmentForm,
    reset: resetSegmentForm,
    formState: { errors: segmentErrors, isSubmitting: isSegmentSubmitting }
  } = segmentForm;

  const notify = useCallback((message: string, type: NotifyType) => {
    onNotify(message, type);
  }, [onNotify]);

  const loadSegments = useCallback(async (options?: { includeInactive?: boolean }): Promise<boolean> => {
    setLoading(true);
    try {
      const list = await getAdminSegments({ includeInactive: options?.includeInactive ?? includeInactive });
      setSegments(list);
      const entries = await Promise.all(
        list.map(async (segment) => {
          try {
            const assignments = await getSegmentAssignments(segment.id);
            return [segment.id, assignments.length] as const;
          } catch {
            return [segment.id, 0] as const;
          }
        })
      );
      setAssignmentCounts(Object.fromEntries(entries));
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los segmentos';
      notify(message, 'danger');
      return false;
    } finally {
      setLoading(false);
    }
  }, [includeInactive, notify]);

  useEffect(() => {
    void loadSegments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modalState || modalState.mode === 'create') {
      resetSegmentForm({ name: '', description: '', active: true });
      return;
    }
    const segment = modalState.segment;
    if (!segment) return;
    resetSegmentForm({
      name: segment.name,
      description: segment.description || '',
      active: Boolean(segment.active)
    });
  }, [modalState, resetSegmentForm]);

  useEffect(() => {
    if (!assignmentModal) return;
    setAssignmentSearch('');
    setAssignmentSelection(new Set());
    setAssignmentError(null);
    let cancelled = false;
    const segmentId = assignmentModal.segment.id;

    const load = async () => {
      setAssignmentLoading(true);
      try {
        let users = allUsers;
        if (!users) {
          users = await getUsuarios();
          if (cancelled) return;
          setAllUsers(users);
        }
        const assignments = await getSegmentAssignments(segmentId);
        if (cancelled) return;

        const nextSelection = new Set(assignments.map(item => item.usuario_id));
        let prefilledDevelopers = 0;
        if (isDeveloperSegment(assignmentModal.segment) && users && Array.isArray(users)) {
          users
            .filter(user => Boolean(user.is_desarrollador))
            .forEach(user => {
              if (!nextSelection.has(user.id)) {
                prefilledDevelopers += 1;
                nextSelection.add(user.id);
              }
            });
        }

        setDeveloperPrefillCount(isDeveloperSegment(assignmentModal.segment) ? prefilledDevelopers : 0);
        setAssignmentSelection(nextSelection);
        setAssignmentCounts(prev => ({ ...prev, [segmentId]: assignments.length }));
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'No se pudieron cargar las asignaciones';
        setAssignmentError(message);
        notify(message, 'danger');
      } finally {
        if (!cancelled) {
          setAssignmentLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [assignmentModal, allUsers, notify]);

  const filteredSegments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return segments;
    return segments.filter(segment => {
      const haystack = [segment.name, segment.description ?? '', segment.id];
      return haystack.some(value => value?.toLowerCase().includes(term));
    });
  }, [segments, searchTerm]);

  const assignmentFilteredUsers = useMemo(() => {
    if (!allUsers) return [] as Usuario[];
    const term = assignmentSearch.trim().toLowerCase();
    const base = term
      ? allUsers.filter(user => {
        const values = [user.nombre || '', user.email || '', user.rol || ''];
        return values.some(value => value?.toLowerCase().includes(term));
      })
      : [...allUsers];
    base.sort((a, b) => {
      const aSelected = assignmentSelection.has(a.id);
      const bSelected = assignmentSelection.has(b.id);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      const label = (usuario: Usuario) => (usuario.nombre || usuario.email || '').toLowerCase();
      return label(a).localeCompare(label(b));
    });
    return base;
  }, [allUsers, assignmentSearch, assignmentSelection]);

  const selectedCount = assignmentSelection.size;
  const totalUsers = allUsers?.length ?? 0;

  const formatDateTime = (value?: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return Intl.DateTimeFormat('es-MX', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  };

  const handleSubmitSegment = submitSegmentForm(async (values) => {
    const description = values.description?.trim() ?? '';
    const payload: SegmentInput = {
      name: values.name,
      description: description ? description : null,
      active: values.active
    };
    const isEdit = modalState?.mode === 'edit' && modalState.segment;
    try {
      if (isEdit) {
        const segmentId = modalState.segment?.id;
        if (!segmentId) {
          throw new Error('Segmento inválido');
        }
        const updated = await updateAdminSegment(segmentId, payload);
        setSegments(list => list.map(item => item.id === updated.id ? updated : item));
        notify('Segmento actualizado', 'success');
      } else {
        const created = await createAdminSegment(payload);
        setSegments(list => [created, ...list]);
        setAssignmentCounts(prev => ({ ...prev, [created.id]: 0 }));
        notify('Segmento creado', 'success');
      }
      await loadSegments();
      setModalState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el segmento';
      notify(message, 'danger');
    }
  });

  const handleToggleActive = async (segment: Segment) => {
    if (!segment.active) {
      setTogglingId(segment.id);
      try {
        const updated = await updateAdminSegment(segment.id, { active: true });
        setSegments(list => list.map(item => item.id === updated.id ? updated : item));
        notify('Segmento activado', 'success');
        await loadSegments();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo activar el segmento';
        notify(message, 'danger');
      } finally {
        setTogglingId(null);
      }
      return;
    }

    const confirmed = await dialog.confirm(`¿Desactivar el segmento “${segment.name}”?`, {
      icon: 'exclamation-triangle-fill',
      confirmText: 'Desactivar'
    });
    if (!confirmed) return;

    setTogglingId(segment.id);
    try {
      const updated = await updateAdminSegment(segment.id, { active: false });
      setSegments(list => list.map(item => item.id === updated.id ? updated : item));
      notify('Segmento desactivado', 'success');
      await loadSegments();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo desactivar el segmento';
      notify(message, 'danger');
    } finally {
      setTogglingId(null);
    }
  };

  const handleRefreshClick = async () => {
    const ok = await loadSegments({ includeInactive });
    if (ok) notify('Segmentos actualizados', 'info');
  };

  const handleIncludeInactiveChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setIncludeInactive(checked);
    await loadSegments({ includeInactive: checked });
  };

  const syncDeveloperFlags = useCallback(async (segment: Segment, selection: Set<number>) => {
    if (!isDeveloperSegment(segment) || !allUsers) return { updated: 0 };

    const updates = allUsers
      .map(user => {
        const nextState = selection.has(user.id);
        const currentState = Boolean(user.is_desarrollador);
        if (nextState === currentState) return null;
        return { usuarioId: user.id, isDesarrollador: nextState };
      })
      .filter((item): item is { usuarioId: number; isDesarrollador: boolean } => item !== null);

    if (updates.length === 0) return { updated: 0 };

    await updateAgendaDevelopers(updates);
    setAllUsers(prev => {
      if (!prev) return prev;
      const updatesMap = new Map(updates.map(item => [item.usuarioId, item.isDesarrollador]));
      return prev.map(user => updatesMap.has(user.id) ? { ...user, is_desarrollador: updatesMap.get(user.id) } : user);
    });

    return { updated: updates.length };
  }, [allUsers]);

  const toggleAssignmentUser = (usuarioId: number) => {
    setAssignmentSelection(prev => {
      const next = new Set(prev);
      if (next.has(usuarioId)) next.delete(usuarioId);
      else next.add(usuarioId);
      return next;
    });
  };

  const closeAssignmentModal = () => {
    setAssignmentModal(null);
    setAssignmentSearch('');
    setAssignmentSelection(new Set());
    setAssignmentError(null);
    setDeveloperPrefillCount(0);
  };

  const selectFilteredUsers = () => {
    if (assignmentFilteredUsers.length === 0) return;
    setAssignmentSelection(prev => {
      const next = new Set(prev);
      assignmentFilteredUsers.forEach(user => next.add(user.id));
      return next;
    });
  };

  const clearAssignmentSelection = () => {
    setAssignmentSelection(new Set());
  };

  const handleAssignmentSave = async () => {
    if (!assignmentModal) return;
    setAssignmentSaving(true);
    setAssignmentError(null);
    let shouldCloseModal = true;
    try {
      const usuarioIds = Array.from(assignmentSelection.values());
      const updatedAssignments = await updateSegmentAssignments(assignmentModal.segment.id, usuarioIds);
      setAssignmentCounts(prev => ({ ...prev, [assignmentModal.segment.id]: updatedAssignments.length }));
      let notifyType: NotifyType = 'success';
      let notifyMessage = 'Asignaciones guardadas';

      if (isDeveloperSegment(assignmentModal.segment)) {
        try {
          const { updated } = await syncDeveloperFlags(assignmentModal.segment, new Set(assignmentSelection));
          if (updated > 0) {
            notifyMessage = `${notifyMessage}; agenda sincronizada (${updated})`;
          }
        } catch (error) {
          shouldCloseModal = false;
          notifyType = 'warning';
          const detail = error instanceof Error ? error.message : 'Error desconocido';
          setAssignmentError(`No se pudieron sincronizar los accesos a agenda: ${detail}`);
          notifyMessage = `${notifyMessage}, pero no se sincronizaron los accesos a agenda`;
        }
      }

      notify(notifyMessage, notifyType);
      await loadSegments();
      if (shouldCloseModal) {
        closeAssignmentModal();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron guardar las asignaciones';
      setAssignmentError(message);
      notify(message, 'danger');
    } finally {
      setAssignmentSaving(false);
    }
  };

  return (
    <section className="border rounded p-3 bg-white shadow-sm">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpenSegments(open => !open)}
          aria-expanded={openSegments}
          className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
        >
          <i className={`bi bi-caret-${openSegments ? 'down' : 'right'}-fill`}></i>
          <span className="fw-bold small text-uppercase">Segmentos</span>
        </button>
        {openSegments && (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                id="segmentos-include-inactive"
                checked={includeInactive}
                onChange={handleIncludeInactiveChange}
              />
              <label className="form-check-label small" htmlFor="segmentos-include-inactive">
                Mostrar inactivos
              </label>
            </div>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleRefreshClick} disabled={loading}>
              {loading ? 'Actualizando…' : 'Refrescar'}
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm"
              onClick={() => setModalState({ mode: 'create' })}
            >
              <i className="bi bi-plus-lg"></i> Nuevo segmento
            </button>
          </div>
        )}
      </div>

      {openSegments && (
        <>
          <div className="row g-2 mt-3 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label small mb-1">Buscar</label>
              <input
                className="form-control form-control-sm"
                placeholder="Nombre o descripción"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="col-12 col-md-8">
              <div className="alert alert-info small mb-0">
                Administra los segmentos utilizados para elegibilidad de campañas y asignación de usuarios.
              </div>
            </div>
          </div>

          <div className="table-responsive mt-3" style={{ maxHeight: 420 }}>
            <table className="table table-sm align-middle table-hover">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '22%' }}>Nombre</th>
                  <th style={{ width: '30%' }}>Descripción</th>
                  <th className="text-center" style={{ width: '8%' }}>Usuarios</th>
                  <th className="text-center" style={{ width: '10%' }}>Estado</th>
                  <th className="text-center" style={{ width: '15%' }}>Creado</th>
                  <th className="text-center" style={{ width: '15%' }}>Actualizado</th>
                  <th style={{ width: '15%' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted small py-4">Cargando segmentos…</td>
                  </tr>
                )}
                {!loading && filteredSegments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted small py-4">Sin resultados</td>
                  </tr>
                )}
                {!loading && filteredSegments.map(segment => (
                  <tr key={segment.id} className={!segment.active ? 'table-secondary' : undefined}>
                    <td>
                      <div className="fw-semibold">{segment.name}</div>
                      <div className="text-muted small">ID: {segment.id}</div>
                    </td>
                    <td className="small">{segment.description || <span className="text-muted">Sin descripción</span>}</td>
                    <td className="text-center small">
                      {Object.prototype.hasOwnProperty.call(assignmentCounts, segment.id)
                        ? assignmentCounts[segment.id]
                        : <span className="text-muted">—</span>}
                    </td>
                    <td className="text-center">
                      {segment.active ? (
                        <span className="badge text-bg-success">Activo</span>
                      ) : (
                        <span className="badge text-bg-secondary">Inactivo</span>
                      )}
                    </td>
                    <td className="text-center small">{formatDateTime(segment.created_at)}</td>
                    <td className="text-center small">{formatDateTime(segment.updated_at)}</td>
                    <td className="text-end">
                      <div className="btn-group">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => setAssignmentModal({ segment })}
                        >
                          Usuarios
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => setModalState({ mode: 'edit', segment })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className={`btn btn-sm ${segment.active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          onClick={() => void handleToggleActive(segment)}
                          disabled={togglingId === segment.id}
                        >
                          {togglingId === segment.id ? 'Guardando…' : segment.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {modalState && (
            <AppModal
              title={modalState.mode === 'edit' ? 'Editar segmento' : 'Nuevo segmento'}
              icon={modalState.mode === 'edit' ? 'pencil-square' : 'plus-lg'}
              width={520}
              onClose={() => setModalState(null)}
              footer={
                <>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setModalState(null)}
                    disabled={isSegmentSubmitting}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm ms-2"
                    form="segment-form"
                    disabled={isSegmentSubmitting}
                  >
                    {isSegmentSubmitting ? 'Guardando' : 'Guardar'}
                  </button>
                </>
              }
            >
              <form
                id="segment-form"
                onSubmit={handleSubmitSegment}
              >
                <div className="mb-3">
                  <label className="form-label small mb-1" htmlFor="segment-name">Nombre</label>
                  <input
                    id="segment-name"
                    className={`form-control form-control-sm${segmentErrors.name ? ' is-invalid' : ''}`}
                    placeholder="Ej. Promotores 2025"
                    autoFocus
                    maxLength={120}
                    {...registerSegment('name')}
                  />
                  {segmentErrors.name && (
                    <div className="invalid-feedback">{segmentErrors.name.message}</div>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label small mb-1" htmlFor="segment-description">Descripción</label>
                  <textarea
                    id="segment-description"
                    className={`form-control form-control-sm${segmentErrors.description ? ' is-invalid' : ''}`}
                    rows={3}
                    placeholder="Contexto o criterios del segmento"
                    {...registerSegment('description')}
                  ></textarea>
                  {segmentErrors.description ? (
                    <div className="invalid-feedback">{segmentErrors.description.message}</div>
                  ) : (
                    <div className="form-text">Opcional, visible para otros administradores.</div>
                  )}
                </div>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="segment-active"
                    {...registerSegment('active')}
                  />
                  <label className="form-check-label" htmlFor="segment-active">Segmento activo</label>
                </div>
              </form>
            </AppModal>
          )}

          {assignmentModal && (
            <AppModal
              title={`Asignar usuarios · ${assignmentModal.segment.name}`}
              icon="people-fill"
              width={760}
              onClose={closeAssignmentModal}
              footer={
                <>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={closeAssignmentModal} disabled={assignmentSaving}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary btn-sm ms-2" onClick={handleAssignmentSave} disabled={assignmentSaving || assignmentLoading}>
                    {assignmentSaving ? 'Guardando…' : 'Guardar asignaciones'}
                  </button>
                </>
              }
            >
              {assignmentLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Cargando…</span>
                  </div>
                </div>
              ) : (
                <>
                  {isDeveloperSegment(assignmentModal.segment) && (
                    <div className="alert alert-info small" role="alert">
                      <strong>Agenda interna:</strong> usa este segmento para controlar quién puede acompañar citas como desarrollador comercial.
                      {developerPrefillCount > 0 && (
                        <span className="d-block mt-1">
                          Se preseleccionaron {developerPrefillCount} usuarios que ya estaban marcados como desarrolladores.
                        </span>
                      )}
                    </div>
                  )}
                  <div className="row g-2 align-items-end mb-3">
                    <div className="col-12 col-md-6">
                      <label className="form-label small mb-1" htmlFor="segment-assign-search">Buscar usuario</label>
                      <input
                        id="segment-assign-search"
                        className="form-control form-control-sm"
                        placeholder="Nombre, correo o rol"
                        value={assignmentSearch}
                        onChange={event => setAssignmentSearch(event.target.value)}
                      />
                    </div>
                    <div className="col-12 col-md-6 d-flex justify-content-between align-items-end gap-2">
                      <div className="small text-muted">
                        {totalUsers > 0 ? `${selectedCount} de ${totalUsers} usuarios seleccionados` : 'Sin usuarios disponibles'}
                      </div>
                      <div className="d-flex gap-2">
                        <button type="button" className="btn btn-outline-primary btn-sm" onClick={selectFilteredUsers} disabled={assignmentFilteredUsers.length === 0}>
                          Seleccionar visibles
                        </button>
                        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearAssignmentSelection} disabled={assignmentSelection.size === 0}>
                          Limpiar
                        </button>
                      </div>
                    </div>
                  </div>
                  {assignmentError && (
                    <div className="alert alert-danger small" role="alert">
                      {assignmentError}
                    </div>
                  )}
                  {allUsers && allUsers.length === 0 ? (
                    <div className="alert alert-warning small" role="alert">
                      No hay usuarios disponibles para asignar.
                    </div>
                  ) : (
                    <div className="border rounded overflow-auto" style={{ maxHeight: 360 }}>
                      <table className="table table-sm align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th style={{ width: '55%' }}>Usuario</th>
                            <th className="text-center" style={{ width: '20%' }}>Rol</th>
                            <th className="text-center" style={{ width: '25%' }}>Asignado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {assignmentFilteredUsers.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-center text-muted small py-3">Sin resultados</td>
                            </tr>
                          ) : (
                            assignmentFilteredUsers.map(user => {
                            const inputId = `segment-assign-${user.id}`;
                            const assigned = assignmentSelection.has(user.id);
                            return (
                              <tr key={user.id} className={!user.activo ? 'table-secondary' : undefined}>
                                <td>
                                  <div className="fw-semibold">{user.nombre || user.email}</div>
                                  <div className="text-muted small">{user.email}</div>
                                  {!user.activo && (
                                    <span className="badge bg-warning-subtle text-warning border border-warning-subtle mt-1">Inactivo</span>
                                  )}
                                </td>
                                <td className="text-center small text-uppercase">{user.rol}</td>
                                <td className="text-center">
                                  <div className="form-check form-switch d-inline-flex align-items-center">
                                    <input
                                      id={inputId}
                                      className="form-check-input"
                                      type="checkbox"
                                      checked={assigned}
                                      onChange={() => toggleAssignmentUser(user.id)}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </AppModal>
          )}
        </>
      )}
    </section>
  );
}
