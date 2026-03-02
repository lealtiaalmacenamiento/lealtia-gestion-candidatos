// =============================================================================
// TIPOS DEL DASHBOARD EJECUTIVO
// Corresponden 1:1 con los retornos de las RPCs definidas en
// supabase/migrations/20260228_executive_dashboard.sql
// =============================================================================

// ---------------------------------------------------------------------------
// FILTROS GLOBALES (Zona 1)
// ---------------------------------------------------------------------------

export type DatePreset = 'mes_actual' | 'trimestre' | 'anio' | 'anio_anterior' | 'personalizado'

export interface ExecFilters {
  preset: DatePreset
  desde: string        // YYYY-MM-DD
  hasta: string        // YYYY-MM-DD
  /** UUID de auth.users del asesor seleccionado. Null = todos. */
  asesorAuthId: string | null
}

// ---------------------------------------------------------------------------
// ASESORES (dropdown de filtros — rpc_exec_asesores_list)
// ---------------------------------------------------------------------------

export interface ExecAsesor {
  usuario_id: number
  asesor_auth_id: string
  nombre: string
  email: string
  rol: 'agente' | 'supervisor'
}

// ---------------------------------------------------------------------------
// KPIs (Zona 2 — rpc_exec_kpis)
// ---------------------------------------------------------------------------

export interface ExecKpis {
  // Embudo candidatos (snapshot actual)
  total_candidatos: number
  total_prospectos: number
  total_cotizando: number
  total_ganados: number
  total_perdidos: number
  // Clientes y pólizas
  total_clientes: number
  polizas_activas: number
  polizas_canceladas: number
  // Financiero
  ingreso_mxn: number
  proyeccion_fin_mes: number
  // Prospectos por estado (filtrados por periodo)
  prospectos_pendiente: number
  prospectos_seguimiento: number
  prospectos_con_cita: number
  prospectos_descartado: number
  // Metadatos del período
  periodo_desde: string
  periodo_hasta: string
  dias_transcurridos: number
  dias_mes: number
}

// ---------------------------------------------------------------------------
// TENDENCIA MENSUAL (Zona 2 — rpc_exec_tendencia)
// ---------------------------------------------------------------------------

export interface ExecTendenciaMes {
  mes: string          // YYYY-MM
  mes_label: string    // "Feb 26"
  nuevos_candidatos: number
  ganados: number
  polizas_emitidas: number
  ingreso_emitido: number
}

export type ExecTendencia = ExecTendenciaMes[]

// ---------------------------------------------------------------------------
// EMBUDO DE CONVERSIÓN (Zona 3 — rpc_exec_funnel)
// Fuente: tabla candidatos (CRM principal)
// ---------------------------------------------------------------------------

export interface ExecFunnelStep {
  key: string          // PhaseKey: 'prospeccion' | 'registro' | ... | 'agente'
  label: string        // Etiqueta legible de la fase
  count: number
  porcentaje: number
}

export type ExecFunnel = ExecFunnelStep[]

// ---------------------------------------------------------------------------
// SLA / TIEMPOS (Zona 3 — rpc_exec_sla_stats)
// Fuente: tabla prospectos (first_visit_at, created_at, updated_at)
// ---------------------------------------------------------------------------

export interface ExecSlaStats {
  tiempo_primer_contacto_dias: number | null
  tiempo_cierre_dias: number | null
  sin_primer_contacto: number
  muestra_total: number
}

// ---------------------------------------------------------------------------
// ACTIVIDAD COMERCIAL (Zona 3 — rpc_exec_citas_stats)
// ---------------------------------------------------------------------------

export interface ExecCitasMes {
  mes: string
  mes_label: string
  total: number
  confirmadas: number
  canceladas: number
  completadas: number
}

export interface ExecCitasStats {
  total: number
  confirmadas: number
  canceladas: number
  completadas: number
  pendientes: number
  por_mes: ExecCitasMes[]
}

// ---------------------------------------------------------------------------
// MOTIVOS DE DESCARTE (Zona 3 — rpc_exec_motivos_descarte)
// Fuente: tabla prospectos (estado = 'descartado' + motivo_descarte)
// ---------------------------------------------------------------------------

export interface ExecMotivoDescarte {
  motivo: string
  count: number
}

export type ExecMotivosDescarte = ExecMotivoDescarte[]

// ---------------------------------------------------------------------------
// PÓLIZAS POR TIPO (Zona 3 — rpc_exec_polizas_por_tipo)
// Gráfica de dona VI / GMM
// ---------------------------------------------------------------------------

export interface ExecPolizaTipo {
  tipo: string          // "VI" | "GMM" | "Sin tipo"
  count: number
  prima_total: number
}

export type ExecPolizasPorTipo = ExecPolizaTipo[]

// ---------------------------------------------------------------------------
// PÓLIZAS POR VENCER (Zona 3 — rpc_exec_polizas_vencer)
// ---------------------------------------------------------------------------

export interface ExecPolizaVencer {
  poliza_id: string
  numero_poliza: string
  cliente: string
  asesor: string
  fecha_renovacion: string  // YYYY-MM-DD
  dias_restantes: number
  prima_mxn: number
  tipo_producto: string
}

export type ExecPolizasVencer = ExecPolizaVencer[]

// ---------------------------------------------------------------------------
// TOP ASESORES (Zona 4 — rpc_exec_top_asesores)
// ---------------------------------------------------------------------------

export interface ExecTopAsesor {
  usuario_id: number
  asesor_auth_id: string
  nombre: string
  email: string
  rol: string
  clientes_total: number
  polizas_activas: number
  ingreso_generado: number
  candidatos_nuevos: number
  candidatos_ganados: number
  conversion_pct: number
}

export type ExecTopAsesores = ExecTopAsesor[]

// ---------------------------------------------------------------------------
// TOP CLIENTES (Zona 4 — rpc_exec_top_clientes)
// ---------------------------------------------------------------------------

export interface ExecTopCliente {
  cliente_id: string
  cliente_code: string
  nombre: string
  asesor: string
  polizas_activas: number
  valor_total: number
}

export type ExecTopClientes = ExecTopCliente[]

// ---------------------------------------------------------------------------
// RESPUESTA GENÉRICA DE LA API ROUTE
// ---------------------------------------------------------------------------

export type ExecRpc =
  | 'asesores_list'
  | 'kpis'
  | 'tendencia'
  | 'funnel'
  | 'sla_stats'
  | 'citas_stats'
  | 'motivos_descarte'
  | 'polizas_por_tipo'
  | 'polizas_vencer'
  | 'top_asesores'
  | 'top_clientes'

export interface ExecApiResponse<T> {
  data: T | null
  error: string | null
}

// ---------------------------------------------------------------------------
// ESTADO COMPLETO DEL DASHBOARD (para el Context / Store del cliente)
// ---------------------------------------------------------------------------

export interface ExecDashboardState {
  filters: ExecFilters
  asesores: ExecAsesor[]
  kpis: ExecKpis | null
  tendencia: ExecTendencia
  funnel: ExecFunnel
  slaStats: ExecSlaStats | null
  citasStats: ExecCitasStats | null
  motivosDescarte: ExecMotivosDescarte
  polizasPorTipo: ExecPolizasPorTipo
  polizasVencer: ExecPolizasVencer
  topAsesores: ExecTopAsesores
  topClientes: ExecTopClientes
  loading: boolean
  error: string | null
}
