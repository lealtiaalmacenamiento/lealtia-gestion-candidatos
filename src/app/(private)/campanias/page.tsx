"use client";

import AgentCampaignsView from './AgentCampaignsView';

export default function CampaniasPage() {
  // Módulo de campañas siempre muestra la vista de tarjetas (elegibles para el usuario)
  // El wizard administrativo solo es accesible desde /parametros
  return <AgentCampaignsView />;
}
