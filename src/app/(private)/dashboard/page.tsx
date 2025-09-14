'use client';
import React from 'react';
import { useAuth } from '@/context/AuthProvider';
import Link from 'next/link';
import FullScreenLoader from '@/components/ui/FullScreenLoader';

// Definimos roles en minúsculas para comparación uniforme
const modules = [
  { key: 'candidatos/nuevo', title: 'Registrar candidato', desc: 'Alta de un nuevo candidato', icon: 'person-plus', roles: ['editor', 'superusuario', 'admin'], color: 'primary' },
  { key: 'consulta_candidatos', title: 'Consulta de candidatos', desc: 'Listado y seguimiento', icon: 'card-list', roles: ['viewer', 'lector', 'editor', 'superusuario', 'admin'], color: 'success' },
  { key: 'usuarios', title: 'Usuarios', desc: 'Gestión de cuentas', icon: 'people', roles: ['superusuario', 'admin'], color: 'secondary' },
  { key: 'asesor', title: 'Vista Asesor', desc: 'Clientes y pólizas (solo lectura)', icon: 'eyeglasses', roles: ['viewer', 'lector', 'editor', 'superusuario', 'admin'], color: 'info' },
  { key: 'parametros', title: 'Parámetros', desc: 'Catálogos y configuración', icon: 'gear', roles: ['superusuario', 'admin'], color: 'warning' },
  { key: 'auditoria', title: 'Registro de acciones', desc: 'Trazabilidad del sistema', icon: 'clock-history', roles: ['superusuario', 'admin'], color: 'info' },
  { key: 'eliminarcandidatos', title: 'Candidatos Eliminados', desc: 'Historial de bajas lógicas', icon: 'archive', roles: ['superusuario', 'admin'], color: 'dark' },
];

export default function DashboardPage() {
  const { user, setUser, loadingUser } = useAuth();
  const [loggingOut, setLoggingOut] = React.useState(false);

  if (loadingUser) return <FullScreenLoader text="Cargando usuario..." />;
  if (!user) return <FullScreenLoader text="Redirigiendo a inicio de sesión..." />;

  let role = (user?.rol || '').toLowerCase();
  if (role === 'lector') role = 'viewer';
  const username = user?.nombre || user?.email || '—';

  const handleLogout = async () => {
    setLoggingOut(true);
    await fetch('/api/logout');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <>
      <nav className="navbar navbar-expand-lg mb-4" style={{ background: '#072e40' }}>
        <div className="container d-flex align-items-center gap-2 flex-wrap">
          <span className="navbar-brand fw-bold text-white mb-0">Lealtia</span>
          <span className="inline-flex align-items-center gap-2 bg-white text-[#072e40] px-3 py-1 rounded-pill small fw-semibold shadow-sm border border-white mb-0" title={`Usuario: ${username}`}>
            <i className="bi bi-person-fill text-[#072e40]"></i>
            Usuario: {username}
          </span>
          <span className="inline-flex align-items-center gap-2 bg-white text-[#072e40] px-3 py-1 rounded-pill small fw-semibold shadow-sm border border-white mb-0" title={`Rol: ${role || '—'}`}> 
            <i className="bi bi-shield-lock-fill text-[#072e40]"></i>
            Rol: {role || '—'}
          </span>
          <div className="ms-auto d-flex align-items-center">
            <button className="border border-white text-white px-4 py-1 rounded-pill bg-transparent hover:bg-white hover:text-[#072e40] transition small fw-medium btn btn-sm" onClick={handleLogout} disabled={loggingOut}>
              {loggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </nav>

      <div className="container">
        <h5 className="mb-4">Panel principal</h5>
        <div className="row g-3">
          {role
            ? (()=>{
                const allowed = modules.filter(m => m.roles.includes(role));
                if(!allowed.length) return (
                  <div className="col-12"><div className="alert alert-warning">No tienes módulos asignados.</div></div>
                );
                return allowed.map((m,idx)=>(
                <div className="col-sm-6 col-lg-4" key={m.key}>
                  <div className={`card h-100 dash-module dash-anim stagger-${idx+1} border-0 shadow-sm dash-border-${m.color}`}>
                    <div className="card-body d-flex flex-column">
                      <div className="d-flex align-items-start mb-2 gap-2">
                        <span className={`dash-ico text-${m.color}`}>{/* icon */}<i className={`bi bi-${m.icon}`}></i></span>
                        <h6 className="card-title mb-0 fw-semibold flex-grow-1">{m.title}</h6>
                      </div>
                      <p className="text-muted small mb-3 flex-grow-1">{m.desc}</p>
                      <div className="mt-auto d-flex justify-content-between align-items-center">
                        <Link href={`/${m.key}`} className={`btn btn-sm btn-${m.color} px-3`}>Abrir</Link>
                        <span className="chevron ms-2 text-muted"><i className="bi bi-arrow-right-short fs-5"></i></span>
                      </div>
                    </div>
                  </div>
                </div>
                ))
              })()
            : (
                <div className="col-12">
                  <div className="alert alert-warning">No tienes un rol válido para ver el menú.</div>
                </div>
              )}
        </div>
      </div>
    </>
  );
}
