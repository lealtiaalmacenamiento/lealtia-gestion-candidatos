"use client";
import { useState, useEffect, useCallback } from 'react';
import type { PuntosThreshold, ClasificacionPuntos, TipoProducto } from '@/types';

const CLASIFICACIONES: ClasificacionPuntos[] = ['CERO', 'SIMPLE', 'MEDIO', 'DOBLE', 'TRIPLE'];
const TIPOS_PRODUCTO: TipoProducto[] = ['GMM', 'VI'];

interface Props {
  onNotif: (msg: string, type: 'success' | 'danger' | 'info' | 'warning') => void;
}

export default function PuntosThresholdsSection({ onNotif }: Props) {
  const [thresholds, setThresholds] = useState<PuntosThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<Partial<PuntosThreshold> | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newRow, setNewRow] = useState<Partial<PuntosThreshold>>({
    tipo_producto: 'GMM',
    umbral_min: 0,
    umbral_max: null,
    puntos: 0,
    clasificacion: 'CERO',
    descripcion: '',
    orden: 1,
    activo: true
  });

  const loadThresholds = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/parametros/puntos-thresholds');
      if (res.ok) {
        const data = await res.json();
        setThresholds(data.data || []);
      } else {
        onNotif('Error al cargar umbrales', 'danger');
      }
    } catch {
      onNotif('Error de conexión', 'danger');
    } finally {
      setLoading(false);
    }
  }, [onNotif]);

  useEffect(() => {
    void loadThresholds();
  }, [loadThresholds]);

  const startEdit = (row: PuntosThreshold) => {
    setEditId(row.id);
    setEditRow({ ...row });
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditRow(null);
  };

  const handleEditChange = (field: string, value: unknown) => {
    setEditRow(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const saveEdit = async () => {
    if (!editId || !editRow) return;
    
    try {
      const res = await fetch('/api/parametros/puntos-thresholds', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editId, ...editRow })
      });
      
      if (res.ok) {
        const data = await res.json();
        setThresholds(prev => prev.map(t => t.id === data.data.id ? data.data : t));
        onNotif('Umbral actualizado', 'success');
        cancelEdit();
      } else {
        onNotif('Error al guardar', 'danger');
      }
    } catch {
      onNotif('Error de conexión', 'danger');
    }
  };

  const handleNewChange = (field: string, value: unknown) => {
    setNewRow(prev => ({ ...prev, [field]: value }));
  };

  const addNew = async () => {
    if (!newRow.tipo_producto || newRow.umbral_min === undefined) {
      onNotif('Completa los campos requeridos', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/parametros/puntos-thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRow)
      });
      
      if (res.ok) {
        const data = await res.json();
        setThresholds(prev => [...prev, data.data]);
        onNotif('Umbral creado', 'success');
        setShowAdd(false);
        setNewRow({
          tipo_producto: 'GMM',
          umbral_min: 0,
          umbral_max: null,
          puntos: 0,
          clasificacion: 'CERO',
          descripcion: '',
          orden: 1,
          activo: true
        });
      } else {
        onNotif('Error al crear', 'danger');
      }
    } catch {
      onNotif('Error de conexión', 'danger');
    }
  };

  const deleteThreshold = async (id: string) => {
    if (!confirm('¿Eliminar este umbral?')) return;
    
    try {
      const res = await fetch(`/api/parametros/puntos-thresholds?id=${id}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        setThresholds(prev => prev.filter(t => t.id !== id));
        onNotif('Umbral eliminado', 'success');
      } else {
        onNotif('Error al eliminar', 'danger');
      }
    } catch {
      onNotif('Error de conexión', 'danger');
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '∞';
    return '$' + val.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const gmmThresholds = thresholds.filter(t => t.tipo_producto === 'GMM');
  const viThresholds = thresholds.filter(t => t.tipo_producto === 'VI');

  const renderTable = (tipo: TipoProducto, data: PuntosThreshold[]) => (
    <div className="mb-4">
      <h5 className="mb-3">{tipo === 'GMM' ? 'Gastos Médicos Mayores (GMM)' : 'Vida Individual (VI)'}</h5>
      <div className="table-responsive">
        <table className="table table-sm table-bordered">
          <thead>
            <tr>
              <th style={{width: '50px'}}>Orden</th>
              <th style={{width: '130px'}}>Prima Mínima</th>
              <th style={{width: '130px'}}>Prima Máxima</th>
              <th style={{width: '80px'}}>Puntos</th>
              <th style={{width: '120px'}}>Clasificación</th>
              <th>Descripción</th>
              <th style={{width: '80px'}}>Activo</th>
              <th style={{width: '120px'}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const isEdit = editId === row.id;
              return (
                <tr key={row.id}>
                  <td>
                    {isEdit ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={editRow?.orden ?? row.orden}
                        onChange={e => handleEditChange('orden', parseInt(e.target.value) || 0)}
                      />
                    ) : row.orden}
                  </td>
                  <td>
                    {isEdit ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        value={editRow?.umbral_min ?? row.umbral_min}
                        onChange={e => handleEditChange('umbral_min', parseFloat(e.target.value) || 0)}
                      />
                    ) : formatCurrency(row.umbral_min)}
                  </td>
                  <td>
                    {isEdit ? (
                      <input
                        type="number"
                        className="form-control form-control-sm"
                        placeholder="Sin límite"
                        value={editRow?.umbral_max ?? ''}
                        onChange={e => handleEditChange('umbral_max', e.target.value ? parseFloat(e.target.value) : null)}
                      />
                    ) : formatCurrency(row.umbral_max)}
                  </td>
                  <td>
                    {isEdit ? (
                      <input
                        type="number"
                        step="0.5"
                        className="form-control form-control-sm"
                        value={editRow?.puntos ?? row.puntos}
                        onChange={e => handleEditChange('puntos', parseFloat(e.target.value) || 0)}
                      />
                    ) : row.puntos}
                  </td>
                  <td>
                    {isEdit ? (
                      <select
                        className="form-select form-select-sm"
                        value={editRow?.clasificacion ?? row.clasificacion}
                        onChange={e => handleEditChange('clasificacion', e.target.value)}
                      >
                        {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : row.clasificacion}
                  </td>
                  <td>
                    {isEdit ? (
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={editRow?.descripcion ?? row.descripcion ?? ''}
                        onChange={e => handleEditChange('descripcion', e.target.value)}
                      />
                    ) : row.descripcion}
                  </td>
                  <td>
                    {isEdit ? (
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={editRow?.activo ?? row.activo}
                        onChange={e => handleEditChange('activo', e.target.checked)}
                      />
                    ) : (
                      <span className={`badge ${row.activo ? 'bg-success' : 'bg-secondary'}`}>
                        {row.activo ? 'Sí' : 'No'}
                      </span>
                    )}
                  </td>
                  <td>
                    {isEdit ? (
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-success" onClick={saveEdit}>
                          <i className="bi bi-check"></i>
                        </button>
                        <button className="btn btn-secondary" onClick={cancelEdit}>
                          <i className="bi bi-x"></i>
                        </button>
                      </div>
                    ) : (
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-primary" onClick={() => startEdit(row)}>
                          <i className="bi bi-pencil"></i>
                        </button>
                        <button className="btn btn-outline-danger" onClick={() => deleteThreshold(row.id)}>
                          <i className="bi bi-trash"></i>
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (loading) return <div className="text-center py-4"><div className="spinner-border" role="status"></div></div>;

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h4>Configuración de Puntos por Producto</h4>
          <p className="text-muted mb-0">
            Define los umbrales de prima para asignar puntos y clasificaciones a las pólizas.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <i className="bi bi-plus-circle me-2"></i>
          Añadir Umbral
        </button>
      </div>

      {renderTable('GMM', gmmThresholds)}
      {renderTable('VI', viThresholds)}

      {/* Modal añadir */}
      {showAdd && (
        <div className="modal show d-block" style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Añadir Umbral de Puntos</h5>
                <button type="button" className="btn-close" onClick={() => setShowAdd(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Tipo de Producto</label>
                  <select
                    className="form-select"
                    value={newRow.tipo_producto}
                    onChange={e => handleNewChange('tipo_producto', e.target.value)}
                  >
                    {TIPOS_PRODUCTO.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Orden</label>
                  <input
                    type="number"
                    className="form-control"
                    value={newRow.orden}
                    onChange={e => handleNewChange('orden', parseInt(e.target.value) || 1)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Prima Mínima (MXN)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={newRow.umbral_min}
                    onChange={e => handleNewChange('umbral_min', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Prima Máxima (MXN)</label>
                  <input
                    type="number"
                    className="form-control"
                    placeholder="Dejar vacío para sin límite"
                    value={newRow.umbral_max ?? ''}
                    onChange={e => handleNewChange('umbral_max', e.target.value ? parseFloat(e.target.value) : null)}
                  />
                  <small className="text-muted">Dejar vacío para &ldquo;sin límite superior&rdquo;</small>
                </div>
                <div className="mb-3">
                  <label className="form-label">Puntos</label>
                  <input
                    type="number"
                    step="0.5"
                    className="form-control"
                    value={newRow.puntos}
                    onChange={e => handleNewChange('puntos', parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Clasificación</label>
                  <select
                    className="form-select"
                    value={newRow.clasificacion}
                    onChange={e => handleNewChange('clasificacion', e.target.value)}
                  >
                    {CLASIFICACIONES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label">Descripción</label>
                  <input
                    type="text"
                    className="form-control"
                    value={newRow.descripcion ?? ''}
                    onChange={e => handleNewChange('descripcion', e.target.value)}
                  />
                </div>
                <div className="form-check">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    id="newActivo"
                    checked={newRow.activo}
                    onChange={e => handleNewChange('activo', e.target.checked)}
                  />
                  <label className="form-check-label" htmlFor="newActivo">
                    Activo
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" onClick={addNew}>
                  Crear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
