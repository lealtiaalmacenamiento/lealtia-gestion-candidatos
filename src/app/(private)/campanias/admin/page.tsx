"use client";

import { useAuth } from '@/context/AuthProvider';
import { isSuperRole } from '@/lib/roles';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AdminCampaignsView from '../AdminCampaignsView';
import BasePage from '@/components/BasePage';

export default function CampaniasAdminPage() {
  const { user, loadingUser } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loadingUser && user && !isSuperRole(user.rol)) {
      router.replace('/campanias');
    }
  }, [user, loadingUser, router]);

  if (loadingUser) {
    return (
      <BasePage title="Administrar Campañas">
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Cargando…</span>
          </div>
        </div>
      </BasePage>
    );
  }

  if (!user || !isSuperRole(user.rol)) {
    return (
      <BasePage title="Acceso Denegado">
        <div className="alert alert-warning">
          No tienes permisos para acceder a esta página.
        </div>
      </BasePage>
    );
  }

  return <AdminCampaignsView />;
}
