"use client";
import { useEffect, useState } from 'react';
import { getEfc, createEfc, updateEfc, deleteEfc } from '@/lib/api';
import type { Efc } from '@/types';
import BasePage from '@/components/BasePage';

export default function EfcPage() {
  const [rows, setRows] = useState<Efc[]>([]);
  const [newRow, setNewRow] = useState<Partial<Efc>>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<Partial<Efc> | null>(null);
  const [notif, setNotif] = useState<{ msg: string; type: 'success'|'error' } | null>(null);

  const load = async () => {
    try {
      const data = await getEfc();
      setRows(data);
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  useEffect(() => { load(); }, []);

  const onChangeNew = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewRow(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onChangeEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditRow(prev => prev ? ({ ...prev, [e.target.name]: e.target.value }) : prev);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createEfc(newRow);
      setNewRow({});
      setNotif({ msg: 'EFC creado', type: 'success' });
      load();
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const startEdit = (r: Efc) => {
    setEditId(r.id);
    setEditRow({ ...r });
  };

  const saveEdit = async () => {
    if (!editRow || editId == null) return;
    try {
      await updateEfc(editId, editRow);
      setEditId(null);
      setEditRow(null);
      setNotif({ msg: 'EFC actualizado', type: 'success' });
      load();
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditRow(null);
  };

  const remove = async (id: number) => {
    if (!confirm('¿Eliminar este EFC?')) return;
    try {
      await deleteEfc(id);
      setNotif({ msg: 'EFC eliminado', type: 'success' });
      load();
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error', type: 'error' });
    }
  };

  return (
    <BasePage title="Parámetros MES y EFC" alert={notif ? { type: notif.type === 'error' ? 'danger' : notif.type, message: notif.msg, show: true } : undefined}>
      <form onSubmit={add} className="row g-3 mb-4">
        <div className="col-md-2">
          <input className="form-control" name="efc" value={newRow.efc || ''} onChange={onChangeNew} placeholder="EFC" required />
        </div>
        <div className="col-md-2">
          <input className="form-control" name="periodo_para_ingresar_folio_oficina_virtual" value={newRow.periodo_para_ingresar_folio_oficina_virtual || ''} onChange={onChangeNew} placeholder="Periodo folio OV" />
        </div>
        <div className="col-md-2">
          <input className="form-control" name="periodo_para_playbook" value={newRow.periodo_para_playbook || ''} onChange={onChangeNew} placeholder="Periodo playbook" />
        </div>
        <div className="col-md-2">
          <input className="form-control" name="pre_escuela_sesion_unica_de_arranque" value={newRow.pre_escuela_sesion_unica_de_arranque || ''} onChange={onChangeNew} placeholder="Pre-escuela" />
        </div>
        <div className="col-md-2">
          <input className="form-control" name="fecha_limite_para_presentar_curricula_cdp" value={newRow.fecha_limite_para_presentar_curricula_cdp || ''} onChange={onChangeNew} placeholder="Fecha límite CDP" />
        </div>
        <div className="col-md-2">
          <input className="form-control" name="inicio_escuela_fundamental" value={newRow.inicio_escuela_fundamental || ''} onChange={onChangeNew} placeholder="Inicio fundamental" />
        </div>
        <div className="col-12 text-end">
          <button type="submit" className="btn btn-primary">Agregar EFC</button>
        </div>
      </form>
      <div className="table-responsive">
        <table className="table table-bordered table-hover align-middle">
          <thead className="table-light">
            <tr>
              <th>EFC</th>
              <th>Periodo folio OV</th>
              <th>Periodo playbook</th>
              <th>Pre-escuela</th>
              <th>Fecha límite CDP</th>
              <th>Inicio fundamental</th>
              <th style={{ width: 160 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="text-center">No hay EFC registrados.</td></tr>
            ) : rows.map(r => (
              <tr key={r.id}>
                <td>
                  {editId === r.id ? (
                    <input className="form-control" name="efc" value={editRow?.efc || ''} onChange={onChangeEdit} />
                  ) : (
                    r.efc
                  )}
                </td>
                <td>
                  {editId === r.id ? (
                    <input className="form-control" name="periodo_para_ingresar_folio_oficina_virtual" value={editRow?.periodo_para_ingresar_folio_oficina_virtual || ''} onChange={onChangeEdit} />
                  ) : (
                    r.periodo_para_ingresar_folio_oficina_virtual
                  )}
                </td>
                <td>
                  {editId === r.id ? (
                    <input className="form-control" name="periodo_para_playbook" value={editRow?.periodo_para_playbook || ''} onChange={onChangeEdit} />
                  ) : (
                    r.periodo_para_playbook
                  )}
                </td>
                <td>
                  {editId === r.id ? (
                    <input className="form-control" name="pre_escuela_sesion_unica_de_arranque" value={editRow?.pre_escuela_sesion_unica_de_arranque || ''} onChange={onChangeEdit} />
                  ) : (
                    r.pre_escuela_sesion_unica_de_arranque
                  )}
                </td>
                <td>
                  {editId === r.id ? (
                    <input className="form-control" name="fecha_limite_para_presentar_curricula_cdp" value={editRow?.fecha_limite_para_presentar_curricula_cdp || ''} onChange={onChangeEdit} />
                  ) : (
                    r.fecha_limite_para_presentar_curricula_cdp
                  )}
                </td>
                <td>
                  {editId === r.id ? (
                    <input className="form-control" name="inicio_escuela_fundamental" value={editRow?.inicio_escuela_fundamental || ''} onChange={onChangeEdit} />
                  ) : (
                    r.inicio_escuela_fundamental
                  )}
                </td>
                <td>
                  {editId === r.id ? (
                    <>
                      <button className="btn btn-success btn-sm me-2" type="button" onClick={saveEdit}>Guardar</button>
                      <button className="btn btn-secondary btn-sm" type="button" onClick={cancelEdit}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button className="btn btn-primary btn-sm me-2" type="button" onClick={() => startEdit(r)}>Editar</button>
                      <button className="btn btn-danger btn-sm" type="button" onClick={() => remove(r.id)}>Eliminar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </BasePage>
  );
}
