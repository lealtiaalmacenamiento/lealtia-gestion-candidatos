"use client";
import { useEffect, useState } from 'react';
import BasePage from '@/components/BasePage';
import Link from 'next/link';

interface Enlace {
  id: number;
  clave: string;
  valor: string;
  descripcion?: string | null;
}

export default function AccesosRapidosPage() {
  const [titulo, setTitulo] = useState('Accesos rápidos');
  const [enlaces, setEnlaces] = useState<Enlace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/parametros?tipo=enlaces_rapidos')
      .then(r => r.ok ? r.json() : { data: [] })
      .then(j => {
        const all: Enlace[] = j.data || [];
        const tituloRow = all.find(x => x.clave === '__titulo__');
        if (tituloRow) setTitulo(String(tituloRow.valor));
        setEnlaces(all.filter(x => x.clave !== '__titulo__'));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <BasePage title={titulo}>
      <div className="d-flex align-items-center gap-2 mb-4">
        <Link href="/home" className="btn btn-sm btn-outline-secondary">
          <i className="bi bi-arrow-left me-1"></i>Inicio
        </Link>
        <h5 className="mb-0 fw-semibold">{titulo}</h5>
      </div>

      {loading && (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" />
        </div>
      )}

      {!loading && enlaces.length === 0 && (
        <div className="alert alert-info">No hay enlaces configurados. Un administrador puede añadirlos desde Parámetros → Accesos rápidos.</div>
      )}

      {!loading && enlaces.length > 0 && (
        <div className="row g-3">
          {enlaces.map(e => {
            const url = /^https?:\/\//i.test(String(e.valor)) ? String(e.valor) : `https://${e.valor}`;
            return (
              <div className="col-sm-6 col-lg-4" key={e.id}>
                <div className="card h-100 border-0 shadow-sm" style={{ borderLeft: '4px solid #0d6efd' }}>
                  <div className="card-body d-flex flex-column">
                    <div className="d-flex align-items-start mb-2 gap-2">
                      <span className="fs-4 text-primary"><i className="bi bi-link-45deg"></i></span>
                      <h6 className="card-title mb-0 fw-semibold flex-grow-1">{e.clave}</h6>
                    </div>
                    {e.descripcion && (
                      <p className="text-muted small mb-3 flex-grow-1">{e.descripcion}</p>
                    )}
                    <div className="mt-auto">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm px-3">
                        <i className="bi bi-box-arrow-up-right me-1"></i>Abrir
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </BasePage>
  );
}
