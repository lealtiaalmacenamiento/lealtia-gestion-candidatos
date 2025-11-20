"use client";

import Link from 'next/link';

interface CampaignsSectionProps {
  onNotify: (message: string, type: 'success' | 'danger' | 'info' | 'warning') => void;
}

export default function CampaignsSection({ onNotify }: CampaignsSectionProps) {
  // Silenciar warning de prop no usada
  void onNotify;

  return (
    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-trophy text-success"></i>
        <span className="fw-bold small text-uppercase">Campañas</span>
      </div>
      <Link
        href="/campanias/admin"
        className="btn btn-primary btn-sm"
      >
        <i className="bi bi-gear me-1"></i>
        Configurar campañas
      </Link>
    </div>
  );
}
