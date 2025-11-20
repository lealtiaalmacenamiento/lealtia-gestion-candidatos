"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import AppModal from '@/components/ui/AppModal';
import { useDialog } from '@/components/ui/DialogProvider';
import {
  createAdminProductType,
  getAdminProductTypes,
  updateAdminProductType,
  type ProductTypeAdmin,
  type ProductTypeInput
} from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { productTypeFormSchema, type ProductTypeFormValues } from '@/lib/validation/productTypeSchemas';

type NotifyType = 'success' | 'danger' | 'info' | 'warning';

interface ProductTypesSectionProps {
  onNotify: (message: string, type: NotifyType) => void;
  onChanged?: () => Promise<void> | void;
}

export default function ProductTypesSection({ onNotify, onChanged }: ProductTypesSectionProps) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [productTypes, setProductTypes] = useState<ProductTypeAdmin[]>([]);
  const [modalState, setModalState] = useState<{ mode: 'create' | 'edit'; productType?: ProductTypeAdmin } | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const productTypeForm = useForm<ProductTypeFormValues>({
    resolver: zodResolver(productTypeFormSchema),
    defaultValues: {
      code: '',
      name: '',
      description: '',
      active: true
    }
  });

  const {
    register: registerProductType,
    handleSubmit: submitProductType,
    reset: resetProductTypeForm,
    formState: { errors: productTypeErrors, isSubmitting: isProductTypeSubmitting }
  } = productTypeForm;

  const notify = useCallback((message: string, type: NotifyType) => {
    onNotify(message, type);
  }, [onNotify]);

  const loadProductTypes = useCallback(async (options?: { includeInactive?: boolean }): Promise<boolean> => {
    setLoading(true);
    try {
      const list = await getAdminProductTypes({ includeInactive: options?.includeInactive ?? includeInactive });
      setProductTypes(list);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudieron cargar los tipos de póliza';
      notify(message, 'danger');
      return false;
    } finally {
      setLoading(false);
    }
  }, [includeInactive, notify]);

  useEffect(() => {
    void loadProductTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modalState || modalState.mode === 'create') {
      resetProductTypeForm({ code: '', name: '', description: '', active: true });
      return;
    }
    const productType = modalState.productType;
    if (!productType) return;
    resetProductTypeForm({
      code: productType.code,
      name: productType.name,
      description: productType.description || '',
      active: Boolean(productType.active)
    });
  }, [modalState, resetProductTypeForm]);

  const filteredProductTypes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return productTypes;
    return productTypes.filter(item => {
      const haystack = [item.code, item.name, item.description ?? ''];
      return haystack.some(value => value?.toLowerCase().includes(term));
    });
  }, [productTypes, searchTerm]);

  const handleIncludeInactiveChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const checked = event.target.checked;
    setIncludeInactive(checked);
    await loadProductTypes({ includeInactive: checked });
  };

  const handleRefreshClick = async () => {
    const ok = await loadProductTypes({ includeInactive });
    if (ok) notify('Tipos de póliza actualizados', 'info');
  };

  const handleToggleActive = async (productType: ProductTypeAdmin) => {
    if (!productType.active) {
      setTogglingId(productType.id);
      try {
        const updated = await updateAdminProductType(productType.id, { active: true });
        setProductTypes(list => list.map(item => item.id === updated.id ? updated : item));
        notify('Tipo de póliza activado', 'success');
        await loadProductTypes({ includeInactive });
        if (onChanged) await onChanged();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo activar el tipo de póliza';
        notify(message, 'danger');
      } finally {
        setTogglingId(null);
      }
      return;
    }

    const warning = productType.usageCount > 0
      ? `Este tipo se utiliza en ${productType.usageCount === 1 ? '1 póliza activa' : `${productType.usageCount} pólizas activas`}.
Confirma para desactivarlo.`
      : 'Este tipo se desactivará.';
    const confirmed = await dialog.confirm(`¿Desactivar el tipo “${productType.name}”? ${warning}`, {
      icon: 'exclamation-triangle-fill',
      confirmText: 'Desactivar'
    });
    if (!confirmed) return;

    setTogglingId(productType.id);
    try {
      const updated = await updateAdminProductType(productType.id, { active: false });
      setProductTypes(list => list.map(item => item.id === updated.id ? updated : item));
      notify('Tipo de póliza desactivado', 'success');
      await loadProductTypes({ includeInactive });
      if (onChanged) await onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo desactivar el tipo de póliza';
      notify(message, 'danger');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmitProductType = submitProductType(async (values) => {
    const payload: ProductTypeInput = {
      code: values.code,
      name: values.name,
      description: values.description ? values.description : null,
      active: values.active
    };

    const isEdit = modalState?.mode === 'edit' && modalState.productType;
    let targetProductType: ProductTypeAdmin | undefined;
    let diff: Partial<ProductTypeInput> | null = null;

    if (isEdit) {
      targetProductType = modalState?.productType;
      if (!targetProductType) {
        throw new Error('Tipo de póliza inválido');
      }
      diff = {};
      if (payload.code !== targetProductType.code) diff.code = payload.code;
      if (payload.name !== targetProductType.name) diff.name = payload.name;
      const nextDescription = payload.description ?? null;
      if (nextDescription !== (targetProductType.description ?? null)) diff.description = nextDescription;
      if (payload.active !== targetProductType.active) diff.active = payload.active;
      if (Object.keys(diff).length === 0) {
        notify('No hay cambios por guardar', 'info');
        return;
      }
    }

    try {
      if (isEdit && targetProductType && diff) {
        const updated = await updateAdminProductType(targetProductType.id, diff);
        setProductTypes(list => list.map(item => item.id === updated.id ? updated : item));
        notify('Tipo de póliza actualizado', 'success');
      } else {
        const created = await createAdminProductType(payload);
        setProductTypes(list => [created, ...list]);
        notify('Tipo de póliza creado', 'success');
      }
      await loadProductTypes({ includeInactive });
      if (onChanged) await onChanged();
      setModalState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo guardar el tipo de póliza';
      notify(message, 'danger');
    }
  });

  return (
    <section className="border rounded p-3 bg-white shadow-sm">
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setOpen(openValue => !openValue)}
          aria-expanded={open}
          className="btn btn-link text-decoration-none p-0 d-flex align-items-center gap-2"
        >
          <i className={`bi bi-caret-${open ? 'down' : 'right'}-fill`}></i>
          <span className="fw-bold small text-uppercase">Tipos de póliza</span>
        </button>
        {open && (
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="form-check form-switch mb-0">
              <input
                className="form-check-input"
                type="checkbox"
                id="product-types-include-inactive"
                checked={includeInactive}
                onChange={handleIncludeInactiveChange}
              />
              <label className="form-check-label small" htmlFor="product-types-include-inactive">
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
              <i className="bi bi-plus-lg"></i> Nuevo tipo
            </button>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="row g-2 mt-3 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label small mb-1">Buscar</label>
              <input
                className="form-control form-control-sm"
                placeholder="Código o nombre"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <div className="col-12 col-md-8">
              <div className="alert alert-info small mb-0">
                Administra el catálogo de tipos de póliza utilizado por las configuraciones de productos.
              </div>
            </div>
          </div>

          <div className="table-responsive mt-3" style={{ maxHeight: 420 }}>
            <table className="table table-sm align-middle table-hover">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '12%' }}>Código</th>
                  <th style={{ width: '24%' }}>Nombre</th>
                  <th style={{ width: '30%' }}>Descripción</th>
                  <th className="text-center" style={{ width: '10%' }}>Uso activo</th>
                  <th className="text-center" style={{ width: '12%' }}>Estado</th>
                  <th className="text-center" style={{ width: '12%' }}>Actualizado</th>
                  <th style={{ width: '14%' }}></th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted small py-4">Cargando tipos de póliza…</td>
                  </tr>
                )}
                {!loading && filteredProductTypes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center text-muted small py-4">No hay tipos de póliza que coincidan</td>
                  </tr>
                )}
                {!loading && filteredProductTypes.map(productType => (
                  <tr key={productType.id} className={!productType.active ? 'table-light text-muted' : undefined}>
                    <td><code>{productType.code}</code></td>
                    <td>{productType.name}</td>
                    <td>{productType.description || '—'}</td>
                    <td className="text-center">
                      {productType.usageCount > 0 ? (
                        <span className="badge bg-primary-subtle text-primary fw-semibold">
                          {productType.usageCount}
                        </span>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </td>
                    <td className="text-center">
                      {productType.active ? (
                        <span className="badge bg-success-subtle text-success fw-semibold">Activo</span>
                      ) : (
                        <span className="badge bg-secondary-subtle text-secondary fw-semibold">Inactivo</span>
                      )}
                    </td>
                    <td className="text-center small text-muted">
                      {formatDateTime(productType.updated_at) ?? '—'}
                    </td>
                    <td>
                      <div className="d-flex gap-2 justify-content-end">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => setModalState({ mode: 'edit', productType })}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => void handleToggleActive(productType)}
                          disabled={togglingId === productType.id}
                        >
                          {productType.active ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {modalState && (
        <AppModal
          title={modalState.mode === 'edit' ? 'Editar tipo de póliza' : 'Nuevo tipo de póliza'}
          icon={modalState.mode === 'edit' ? 'pencil-square' : 'plus-lg'}
          width={560}
          onClose={() => setModalState(null)}
          footer={
            <>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setModalState(null)}
                disabled={isProductTypeSubmitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm ms-2"
                form="product-type-form"
                disabled={isProductTypeSubmitting}
              >
                {isProductTypeSubmitting ? 'Guardando…' : 'Guardar'}
              </button>
            </>
          }
        >
          <form
            id="product-type-form"
            onSubmit={event => {
              event.preventDefault();
              void handleSubmitProductType();
            }}
          >
            <div className="mb-3">
              <label className="form-label small mb-1" htmlFor="product-type-code">Código</label>
              <input
                id="product-type-code"
                className={`form-control form-control-sm${productTypeErrors.code ? ' is-invalid' : ''}`}
                maxLength={16}
                autoComplete="off"
                autoFocus
                {...registerProductType('code')}
              />
              {productTypeErrors.code ? (
                <div className="invalid-feedback">{productTypeErrors.code.message}</div>
              ) : (
                <div className="form-text">2-16 caracteres alfanuméricos, guion o guion bajo.</div>
              )}
            </div>
            <div className="mb-3">
              <label className="form-label small mb-1" htmlFor="product-type-name">Nombre</label>
              <input
                id="product-type-name"
                className={`form-control form-control-sm${productTypeErrors.name ? ' is-invalid' : ''}`}
                autoComplete="off"
                {...registerProductType('name')}
              />
              {productTypeErrors.name && <div className="invalid-feedback">{productTypeErrors.name.message}</div>}
            </div>
            <div className="mb-3">
              <label className="form-label small mb-1" htmlFor="product-type-description">Descripción</label>
              <textarea
                id="product-type-description"
                className={`form-control form-control-sm${productTypeErrors.description ? ' is-invalid' : ''}`}
                rows={3}
                {...registerProductType('description')}
              ></textarea>
              {productTypeErrors.description && (
                <div className="invalid-feedback">{productTypeErrors.description.message}</div>
              )}
            </div>
            <div className="form-check form-switch">
              <input
                id="product-type-active"
                className="form-check-input"
                type="checkbox"
                {...registerProductType('active')}
              />
              <label className="form-check-label small" htmlFor="product-type-active">
                Activo
              </label>
            </div>
          </form>
        </AppModal>
      )}
    </section>
  );
}
