"use client";
import { useState, useEffect, useCallback } from 'react';
import AppModal from '@/components/ui/AppModal';
import { useDialog } from '@/components/ui/DialogProvider';

interface Enlace {
  id: number;
  clave: string;       // etiqueta del botón
  valor: string;       // URL
  descripcion?: string | null;
}

interface Props {
  onNotify: (msg: string, type: 'success' | 'danger' | 'info' | 'warning') => void;
}

const emptyForm = { clave: '', valor: '', descripcion: '' };

export default function EnlacesRapidosSection({ onNotify }: Props) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newForm, setNewForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/parametros?tipo=enlaces_rapidos');
      if (res.ok) {
        const json = await res.json();
        setEnlaces((json.data || []) as Enlace[]);
      } else {
        onNotify('Error al cargar los enlaces', 'danger');
      }
    } catch {
      onNotify('Error de conexión', 'danger');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // ── Crear ───────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!newForm.clave.trim() || !newForm.valor.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/parametros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'enlaces_rapidos',
          clave: newForm.clave.trim(),
          valor: newForm.valor.trim(),
          descripcion: newForm.descripcion.trim() || null,
          solicitante: 'admin',
        }),
      });
      if (res.ok) {
        setShowAdd(false);
        setNewForm(emptyForm);
        onNotify('Enlace añadido', 'success');
        await load();
      } else {
        const j = await res.json();
        onNotify(j.message || 'Error al guardar', 'danger');
      }
    } catch {
      onNotify('Error de conexión', 'danger');
    } finally {
      setSaving(false);
    }
  };

  // ── Editar ───────────────────────────────────────────────────────────
  const startEdit = (e: Enlace) => {
    setEditId(e.id);
    setEditForm({ clave: e.clave, valor: String(e.valor), descripcion: e.descripcion ?? '' });
  };

  const handleEditSave = async () => {
    if (!editForm.clave.trim() || !editForm.valor.trim() || editId === null) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/parametros', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editId,
          clave: editForm.clave.trim(),
          valor: editForm.valor.trim(),
          descripcion: editForm.descripcion.trim() || null,
          solicitante: 'admin',
        }),
      });
      if (res.ok) {
        setEditId(null);
        onNotify('Enlace actualizado', 'success');
        await load();
      } else {
        const j = await res.json();
        onNotify(j.message || 'Error al actualizar', 'danger');
      }
    } catch {
      onNotify('Error de conexión', 'danger');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────────────
  const handleDelete = async (id: number, label: string) => {
    const confirmed = await dialog.confirm(
      `¿Eliminar el enlace "${label}"? Esta acción no se puede deshacer.`,
      { confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );
    if (!confirmed) return;
    try {
      const res = await fetch(`/api/parametros?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        onNotify('Enlace eliminado', 'success');
        await load();
      } else {
        const j = await res.json();
        onNotify(j.message || 'Error al eliminar', 'danger');
      }
    } catch {
      onNotify('Error de conexión', 'danger');
    }
  };

  return (
    <section className="border rounded p-3 bg-white shadow-sm">
      {/* Encabezado */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
        >
          <i className={`bi bi-caret-${open ? 'down' : 'right'}-fill`}></i>
          <span className="fw-bold small text-uppercase">Accesos rápidos (botones en inicio)</span>
        </button>
        {open && (
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={() => { setShowAdd(true); setNewForm(emptyForm); }}
          >
            <i className="bi bi-plus-lg"></i> Añadir enlace
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {loading && <div className="text-center py-3"><div className="spinner-border spinner-border-sm" /></div>}

          {!loading && enlaces.length === 0 && (
            <p className="text-muted small mb-0">No hay enlaces configurados. Agrega el primero.</p>
          )}

          {!loading && enlaces.length > 0 && (
            <div className="table-responsive">
              <table className="table table-sm table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: '28%' }}>Etiqueta del botón</th>
                    <th>URL</th>
                    <th style={{ width: '22%' }}>Descripción</th>
                    <th style={{ width: '100px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {enlaces.map(e => (
                    <tr key={e.id}>
                      {editId === e.id ? (
                        <>
                          <td>
                            <input
                              className="form-control form-control-sm"
                              value={editForm.clave}
                              onChange={ev => setEditForm(f => ({ ...f, clave: ev.target.value }))}
                              placeholder="Texto del botón"
                            />
                          </td>
                          <td>
                            <input
                              className="form-control form-control-sm"
                              value={editForm.valor}
                              onChange={ev => setEditForm(f => ({ ...f, valor: ev.target.value }))}
                              placeholder="https://..."
                            />
                          </td>
                          <td>
                            <input
                              className="form-control form-control-sm"
                              value={editForm.descripcion}
                              onChange={ev => setEditForm(f => ({ ...f, descripcion: ev.target.value }))}
                              placeholder="Descripción (opcional)"
                            />
                          </td>
                          <td className="d-flex gap-1">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={handleEditSave}
                              disabled={editSaving || !editForm.clave.trim() || !editForm.valor.trim()}
                            >
                              {editSaving ? <span className="spinner-border spinner-border-sm" /> : <i className="bi bi-check-lg"></i>}
                            </button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditId(null)}>
                              <i className="bi bi-x-lg"></i>
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="fw-semibold small">{e.clave}</td>
                          <td>
                            <a href={String(e.valor)} target="_blank" rel="noopener noreferrer" className="small text-truncate d-inline-block" style={{ maxWidth: 260 }}>
                              {String(e.valor)}
                            </a>
                          </td>
                          <td className="text-muted small">{e.descripcion || '—'}</td>
                          <td className="d-flex gap-1">
                            <button className="btn btn-outline-secondary btn-sm" title="Editar" onClick={() => startEdit(e)}>
                              <i className="bi bi-pencil"></i>
                            </button>
                            <button className="btn btn-outline-danger btn-sm" title="Eliminar" onClick={() => handleDelete(e.id, e.clave)}>
                              <i className="bi bi-trash"></i>
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal añadir */}
      {showAdd && (
        <AppModal
          title="Añadir acceso rápido"
          icon="link-45deg"
          width={480}
          onClose={() => setShowAdd(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-primary btn-sm ms-2"
                disabled={saving || !newForm.clave.trim() || !newForm.valor.trim()}
                onClick={handleAdd}
              >
                {saving ? <span className="spinner-border spinner-border-sm me-1" /> : <i className="bi bi-check-lg me-1"></i>}
                Guardar
              </button>
            </>
          }
        >
          <div className="mb-3">
            <label className="form-label small mb-1 fw-semibold">Etiqueta del botón <span className="text-danger">*</span></label>
            <input
              className="form-control form-control-sm"
              placeholder="Ej: Portal GNP"
              value={newForm.clave}
              onChange={e => setNewForm(f => ({ ...f, clave: e.target.value }))}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small mb-1 fw-semibold">URL <span className="text-danger">*</span></label>
            <input
              className="form-control form-control-sm"
              placeholder="https://..."
              value={newForm.valor}
              onChange={e => setNewForm(f => ({ ...f, valor: e.target.value }))}
            />
          </div>
          <div className="mb-1">
            <label className="form-label small mb-1 fw-semibold">Descripción (opcional)</label>
            <input
              className="form-control form-control-sm"
              placeholder="Descripción breve"
              value={newForm.descripcion}
              onChange={e => setNewForm(f => ({ ...f, descripcion: e.target.value }))}
            />
          </div>
        </AppModal>
      )}
    </section>
  );
}
