"use client";
import { useEffect, useState } from 'react';
import { getCedulaA1, createCedulaA1, updateCedulaA1, deleteCedulaA1 } from '@/lib/api';
import type { CedulaA1 } from '@/types';
import BasePage from '@/components/BasePage';
import { useDialog } from '@/components/ui/DialogProvider';

export default function CedulaA1Page() {
  const dialog = useDialog();
  const [rows, setRows] = useState<CedulaA1[]>([]);
  const [newRow, setNewRow] = useState<{ mes: string }>({ mes: '' });
  const [editRow, setEditRow] = useState<CedulaA1 | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [notif, setNotif] = useState<{ msg: string; type: 'success' | 'danger' | 'info' | 'warning' } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getCedulaA1();
        setRows(data);
      } catch (err) {
        setNotif({ msg: err instanceof Error ? err.message : 'Error desconocido', type: 'danger' });
      }
    };
    load();
  }, []);

  const onChangeNew = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewRow(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onChangeEdit = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditRow(prev => prev ? ({ ...prev, [e.target.name]: e.target.value }) : prev);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createCedulaA1(newRow);
      setNewRow({ mes: '' });
      setNotif({ msg: 'MES creado', type: 'success' });
      const data = await getCedulaA1();
      setRows(data);
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error desconocido', type: 'danger' });
    }
  };

  const startEdit = (r: CedulaA1) => {
    setEditId(r.id);
    setEditRow({ ...r });
  };

  const saveEdit = async () => {
    if (!editRow || editId == null) return;
    try {
      await updateCedulaA1(editId, editRow);
      setEditId(null);
      setEditRow(null);
      setNotif({ msg: 'MES actualizado', type: 'success' });
      const data = await getCedulaA1();
      setRows(data);
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error desconocido', type: 'danger' });
    }
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditRow(null);
  };

  const remove = async (id: number) => {
    const ok = await dialog.confirm('¿Eliminar este MES?', { icon: 'exclamation-triangle-fill', confirmText: 'Eliminar' });
    if (!ok) return;
    try {
      await deleteCedulaA1(id);
      setNotif({ msg: 'MES eliminado', type: 'success' });
      const data = await getCedulaA1();
      setRows(data);
    } catch (err) {
      setNotif({ msg: err instanceof Error ? err.message : 'Error desconocido', type: 'danger' });
    }
  };

  return (
    <BasePage title="Parámetros MES" alert={notif ? { type: notif.type, message: notif.msg, show: true } : undefined}>
      <form onSubmit={add} className="row g-3 mb-4">
        <div className="col-md-6">
          <input className="form-control" name="mes" value={newRow.mes || ''} onChange={onChangeNew} placeholder="Nuevo MES" required />
        </div>
        <div className="col-md-6">
          <button type="submit" className="btn btn-primary">Agregar MES</button>
        </div>
      </form>
      <table className="table table-bordered table-hover">
        <thead>
          <tr>
            <th>MES</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td>
                {editId === r.id ? (
                  <input className="form-control" name="mes" value={editRow?.mes || ''} onChange={onChangeEdit} />
                ) : (
                  r.mes
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
    </BasePage>
  );
}
