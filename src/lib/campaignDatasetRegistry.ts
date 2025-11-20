import type { CampaignRuleScope } from '@/types'

export type CampaignDatasetKey = string

export type CampaignDatasetField = {
  value: string
  label: string
  path: string[]
  type: 'number' | 'text' | 'boolean'
}

export type CampaignDatasetMetadata = {
  indicator?: string
  detailDescription?: string
  detailedExplanation?: string
  detailedDefinition?: string
  combinedDetail?: string
  relatedCampaigns?: string[]
}

export type CampaignDatasetDefinition = {
  key: CampaignDatasetKey
  label: string
  description?: string
  fields: CampaignDatasetField[]
  scopes: CampaignRuleScope[]
  metadata?: CampaignDatasetMetadata
}

export const BUILTIN_DATASET_KEYS: Set<CampaignDatasetKey> = new Set([
  'polizas',
  'prospectos',
  'candidatos',
  'planificacion',
  'clientes',
  'cancelaciones',
  'rc',
  'tenure'
])

export const CAMPAIGN_DATASET_DEFINITIONS: CampaignDatasetDefinition[] = [
  {
    key: 'polizas',
    label: 'Producción pólizas y primas',
    description: 'Métricas agregadas de pólizas emitidas por el asesor',
    metadata: {
      indicator: 'Pólizas emitidas y primas',
      detailDescription: 'Conteo y monto de pólizas emitidas y vigentes',
      detailedExplanation: 'Se mide volumen de producción (conteos y primas) y puntos para validar premios, bonos y viajes.',
      detailedDefinition: 'Conjunto de métricas operativas de emisión y valor económico.',
      combinedDetail: 'Volumen, valor y puntos de producción del asesor para campañas de logro.',
      relatedCampaigns: ['Ola de Productividad', 'Convenciones', 'Grupo 0', 'Avalancha GMM', 'Momentum']
    },
    fields: [
      { value: 'polizas_total', label: 'Pólizas emitidas', path: ['polizas', 'total'], type: 'number' },
      { value: 'polizas_vigentes', label: 'Pólizas vigentes', path: ['polizas', 'vigentes'], type: 'number' },
      { value: 'polizas_anuladas', label: 'Pólizas anuladas', path: ['polizas', 'anuladas'], type: 'number' },
      { value: 'prima_total_mxn', label: 'Prima total (MXN)', path: ['polizas', 'prima_total_mxn'], type: 'number' },
      { value: 'prima_vigente_mxn', label: 'Prima vigente (MXN)', path: ['polizas', 'prima_vigente_mxn'], type: 'number' },
      { value: 'prima_promedio_mxn', label: 'Prima promedio (MXN)', path: ['polizas', 'prima_promedio_mxn'], type: 'number' },
      { value: 'comision_base_mxn', label: 'Comisión base (MXN)', path: ['polizas', 'comision_base_mxn'], type: 'number' },
      { value: 'ingresos_mxn', label: 'Ingresos totales (MXN)', path: ['polizas', 'ingresos_mxn'], type: 'number' },
      { value: 'puntos_totales', label: 'Puntos totales', path: ['polizas', 'puntos_totales'], type: 'number' },
      { value: 'momentum_vita', label: 'Momentum Vita', path: ['polizas', 'momentum_vita'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'prospectos',
    label: 'Embudo de prospectos y reclutas',
    description: 'Funnel de prospectos y conversión a Reclutas de Calidad',
    metadata: {
      indicator: 'Recluta de Calidad (RC)',
      detailDescription: 'Calidad del recluta medida por productividad',
      detailedExplanation: 'Seguimiento desde prospecto hasta recluta que cumple RC (3 pólizas mensuales y prima anual ≥17000 MXN).',
      detailedDefinition: 'Funnel con tasas de conversión y calidad del recluta.',
      combinedDetail: 'Embudo operativo que culmina en RC, base de desempeño de promotores.',
      relatedCampaigns: ['Promotor 360°', 'Creciendo Contigo']
    },
    fields: [
      { value: 'prospectos_total', label: 'Prospectos totales', path: ['rc', 'prospectos_total'], type: 'number' },
      { value: 'prospectos_con_cita', label: 'Prospectos con cita', path: ['rc', 'prospectos_con_cita'], type: 'number' },
      { value: 'prospectos_seguimiento', label: 'Prospectos en seguimiento', path: ['rc', 'prospectos_seguimiento'], type: 'number' },
      { value: 'prospectos_descartados', label: 'Prospectos descartados', path: ['rc', 'prospectos_descartados'], type: 'number' },
      { value: 'reclutas_calidad', label: 'Reclutas de calidad', path: ['rc', 'reclutas_calidad'], type: 'number' },
      { value: 'reclutas_calidad_ratio', label: '% reclutas de calidad', path: ['rc', 'reclutas_calidad_ratio'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'candidatos',
    label: 'Estado de candidatos conectados',
    description: 'Estado de candidatos vinculados al asesor',
    metadata: {
      indicator: 'Conexión de candidatos (mes_conexion)',
      detailDescription: 'Vigencia y conexión por mes',
      detailedExplanation: 'Si mes_conexion tiene valor → clave definitiva y elegible; si está vacío → no elegible.',
      detailedDefinition: 'Bandera de elegibilidad por conexión activa.',
      combinedDetail: 'Validación automatizada de clave definitiva usando Mes de Conexión.',
      relatedCampaigns: ['Capitanes al Mando', 'Promotor 360°']
    },
    fields: [
      { value: 'total', label: 'Candidatos totales', path: ['candidatos', 'total'], type: 'number' },
      { value: 'activos', label: 'Candidatos activos', path: ['candidatos', 'activos'], type: 'number' },
      { value: 'eliminados', label: 'Candidatos eliminados', path: ['candidatos', 'eliminados'], type: 'number' },
      { value: 'ultimo_mes_conexion', label: 'Mes de conexión', path: ['candidatos', 'ultimo_mes_conexion'], type: 'text' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'planificacion',
    label: 'Planeación semanal asesores',
    description: 'Información de planeación semanal capturada por el asesor',
    metadata: {
      indicator: 'Planeación semanal',
      detailDescription: 'Metas y parámetros de seguimiento',
      detailedExplanation: 'Ancla de disciplina comercial y consistencia en producción semanal.',
      detailedDefinition: 'Registro de metas y promedios para auditoría.',
      combinedDetail: 'Documento operativo que soporta elegibilidad y ritmo de ejecución.',
      relatedCampaigns: ['Seguimiento operativo (varias)']
    },
    fields: [
      { value: 'planes_total', label: 'Planes registrados', path: ['planificacion', 'planes_total'], type: 'number' },
      { value: 'ultima_semana', label: 'Última semana planificada', path: ['planificacion', 'ultima_semana'], type: 'text' },
      { value: 'ultima_actualizacion', label: 'Última actualización', path: ['planificacion', 'ultima_actualizacion'], type: 'text' },
      { value: 'prima_promedio', label: 'Prima que puede ganar', path: ['planificacion', 'prima_promedio'], type: 'number' },
      { value: 'porcentaje_comision', label: 'Porcentaje comisión', path: ['planificacion', 'porcentaje_comision'], type: 'number' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'clientes',
    label: 'Altas de clientes',
    description: 'Altas y totales de clientes asociados al asesor',
    metadata: {
      indicator: 'Altas de clientes',
      detailDescription: 'Nuevas altas por ventana de tiempo',
      detailedExplanation: 'Mide crecimiento de cartera y ritmo de captación para premios.',
      detailedDefinition: 'Conteos segmentados por periodos móviles.',
      combinedDetail: 'Indicador de expansión de cartera y actividad comercial.',
      relatedCampaigns: ['Camino a la Cumbre', 'Graduación']
    },
    fields: [
      { value: 'total', label: 'Clientes totales', path: ['clientes', 'total'], type: 'number' },
      { value: 'nuevos_30_dias', label: 'Altas últimos 30 días', path: ['clientes', 'nuevos_30_dias'], type: 'number' },
      { value: 'nuevos_90_dias', label: 'Altas últimos 90 días', path: ['clientes', 'nuevos_90_dias'], type: 'number' },
      { value: 'ultima_alta', label: 'Último cliente creado', path: ['clientes', 'ultima_alta'], type: 'text' }
    ],
    scopes: ['goal']
  },
  {
    key: 'cancelaciones',
    label: 'Persistencia y cancelaciones',
    description: 'Índices de persistencia y cancelaciones calculados por la ETL',
    metadata: {
      indicator: 'Persistencia LIMRA/IGC',
      detailDescription: 'Medición de permanencia de pólizas',
      detailedExplanation: 'Control de calidad y retención para sostenibilidad de cartera.',
      detailedDefinition: 'Índices estándar sectoriales de continuidad.',
      combinedDetail: 'KPI de salud de cartera que impacta elegibilidad y premios.',
      relatedCampaigns: ['85 años', 'LIMRA/IGC']
    },
    fields: [
      { value: 'indice_limra', label: 'Índice LIMRA', path: ['cancelaciones', 'indice_limra'], type: 'number' },
      { value: 'indice_igc', label: 'Índice IGC', path: ['cancelaciones', 'indice_igc'], type: 'number' },
      { value: 'momentum_neto', label: 'Momentum neto', path: ['cancelaciones', 'momentum_neto'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'rc',
    label: 'Indicadores RC (Reclutas y pólizas)',
    description: 'Métricas mixtas de RC, prospectos y pólizas derivadas',
    metadata: {
      indicator: 'RC (Recluta de Calidad)',
      detailDescription: 'RC: 3 pólizas de Vida mensuales y prima anual ≥17000 MXN',
      detailedExplanation: 'Asegura que los reclutas aporten producción sostenida y permanezcan vigentes.',
      detailedDefinition: 'Calidad del recluta en función de productividad y continuidad.',
      combinedDetail: 'Estándar operativo para evaluar efectividad del reclutamiento.',
      relatedCampaigns: ['Promotor 360°', 'Ola de Productividad', 'Creciendo Contigo']
    },
    fields: [
      { value: 'prospectos_total', label: 'Prospectos totales', path: ['rc', 'prospectos_total'], type: 'number' },
      { value: 'reclutas_calidad', label: 'Reclutas de calidad', path: ['rc', 'reclutas_calidad'], type: 'number' },
      { value: 'prospectos_con_cita', label: 'Prospectos con cita', path: ['rc', 'prospectos_con_cita'], type: 'number' },
      { value: 'prospectos_seguimiento', label: 'Prospectos en seguimiento', path: ['rc', 'prospectos_seguimiento'], type: 'number' },
      { value: 'prospectos_descartados', label: 'Prospectos descartados', path: ['rc', 'prospectos_descartados'], type: 'number' },
      { value: 'polizas_total', label: 'Pólizas asociadas', path: ['rc', 'polizas_total'], type: 'number' },
      { value: 'polizas_vigentes', label: 'Pólizas vigentes (RC)', path: ['rc', 'polizas_vigentes'], type: 'number' },
      { value: 'polizas_anuladas', label: 'Pólizas anuladas (RC)', path: ['rc', 'polizas_anuladas'], type: 'number' },
      { value: 'rc_vigencia', label: 'RC vigencia', path: ['rc', 'rc_vigencia'], type: 'number' },
      { value: 'permanencia', label: 'Permanencia', path: ['rc', 'permanencia'], type: 'number' },
      { value: 'reclutas_calidad_ratio', label: '% reclutas de calidad', path: ['rc', 'reclutas_calidad_ratio'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'tenure',
    label: 'Antigüedad asesor',
    description: 'Antigüedad del asesor en meses desde su primera emisión',
    metadata: {
      indicator: 'Tenure',
      detailDescription: 'Meses de antigüedad',
      detailedExplanation: 'Diferencia asesores nuevos vs consolidados para reglas específicas.',
      detailedDefinition: 'Tiempo transcurrido desde primera póliza emitida.',
      combinedDetail: 'Criterio de segmentación de elegibilidad por madurez.',
      relatedCampaigns: ['Da+', 'Avalancha GMM', 'Proactiva Tech']
    },
    fields: [
      { value: 'tenure_meses', label: 'Meses desde la primera emisión', path: ['tenure_meses'], type: 'number' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'polizas_por_producto',
    label: 'Pólizas por producto específico',
    description: 'Conteo de pólizas filtradas por productos parametrizados específicos',
    metadata: {
      indicator: 'Pólizas por producto',
      detailDescription: 'Conteo de pólizas de productos parametrizados específicos seleccionados',
      detailedExplanation: 'Permite validar producción de productos específicos (ej: Vida Universal Plus, GMM Integral, etc.) seleccionados en la campaña.',
      detailedDefinition: 'Filtro flexible por uno o más productos parametrizados individuales identificados por ID.',
      combinedDetail: 'Base para campañas que requieren productos parametrizados específicos.',
      relatedCampaigns: ['Reto 5000', 'Da+', 'Avalancha GMM']
    },
    fields: [
      { value: 'cantidad', label: 'Cantidad de pólizas', path: ['datasets', 'polizas_por_producto', 'cantidad'], type: 'number' },
      { value: 'producto_ids', label: 'IDs de productos', path: ['datasets', 'polizas_por_producto', 'producto_ids'], type: 'text' }
    ],
    scopes: ['eligibility', 'goal']
  },
  {
    key: 'polizas_prima_minima',
    label: 'Pólizas con prima mínima',
    description: 'Pólizas que cumplen con un umbral de prima mínima',
    metadata: {
      indicator: 'Prima mínima por póliza',
      detailDescription: 'Conteo de pólizas con prima >= umbral',
      detailedExplanation: 'Valida que las pólizas alcancen el monto mínimo requerido por la campaña.',
      detailedDefinition: 'Filtro por prima mínima individual de póliza.',
      combinedDetail: 'Control de calidad de producción por tamaño de prima.',
      relatedCampaigns: ['Reto 5000', 'Da+', 'Momentum']
    },
    fields: [
      { value: 'cantidad', label: 'Cantidad de pólizas', path: ['datasets', 'polizas_prima_minima', 'cantidad'], type: 'number' },
      { value: 'prima_minima_mxn', label: 'Prima mínima (MXN)', path: ['datasets', 'polizas_prima_minima', 'prima_minima_mxn'], type: 'number' }
    ],
    scopes: ['eligibility', 'goal']
  },
  {
    key: 'polizas_recientes',
    label: 'Pólizas emitidas recientemente',
    description: 'Pólizas emitidas dentro de una ventana de tiempo, opcionalmente validando que sean iniciales (sin historial previo)',
    metadata: {
      indicator: 'Emisiones recientes',
      detailDescription: 'Pólizas nuevas en últimos N días',
      detailedExplanation: 'Mide actividad comercial reciente del asesor. Puede filtrar por pólizas iniciales sin renovación previa.',
      detailedDefinition: 'Conteo con ventana temporal configurable y validación opcional de que no existan pólizas previas del mismo tipo en el periodo de verificación.',
      combinedDetail: 'Indicador de ritmo y momentum de ventas, distinguiendo entre renovaciones y negocio nuevo.',
      relatedCampaigns: ['Reto 5000', 'Da+', 'Ola de Productividad']
    },
    fields: [
      { value: 'cantidad', label: 'Cantidad de pólizas', path: ['datasets', 'polizas_recientes', 'cantidad'], type: 'number' },
      { value: 'dias_ventana', label: 'Ventana de días (emisión)', path: ['datasets', 'polizas_recientes', 'dias_ventana'], type: 'number' },
      { value: 'solo_iniciales', label: 'Solo pólizas iniciales', path: ['datasets', 'polizas_recientes', 'solo_iniciales'], type: 'boolean' },
      { value: 'dias_verificacion_previa', label: 'Días verificación historial previo', path: ['datasets', 'polizas_recientes', 'dias_verificacion_previa'], type: 'number' }
    ],
    scopes: ['eligibility', 'goal']
  },
  {
    key: 'clasificacion_asesor',
    label: 'Clasificación asesor (PF activo)',
    description: 'Clasificación corporativa y bandera de elegibilidad',
    metadata: {
      indicator: 'Clave definitiva por Mes de Conexión',
      detailDescription: 'PF activo con conexión vigente',
      detailedExplanation: 'Mes de Conexión poblado implica clave definitiva y elegibilidad.',
      detailedDefinition: 'Bandera de participación por estatus corporativo.',
      combinedDetail: 'Automatiza validación de elegibilidad corporativa.',
      relatedCampaigns: ['Reto 5000', 'Da+', 'Grupo 0']
    },
    fields: [
      { value: 'permitido', label: 'Clasificación permitida', path: ['datasets', 'clasificacion_asesor', 'permitido'], type: 'text' },
      { value: 'clasificacion', label: 'Clasificación actual', path: ['datasets', 'clasificacion_asesor', 'clasificacion'], type: 'text' },
      { value: 'mes_conexion', label: 'Mes de conexión', path: ['datasets', 'clasificacion_asesor', 'mes_conexion'], type: 'text' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'primera_poliza_bonus',
    label: 'Bono primera póliza',
    description: 'Indica si aplica el bono de primera póliza',
    metadata: {
      indicator: 'Bono primera póliza',
      detailDescription: 'Incentivo a primera venta',
      detailedExplanation: 'Reconoce a nuevos asesores por su primera emisión válida.',
      detailedDefinition: 'Bandera de estímulo inicial.',
      combinedDetail: 'Activa beneficios de arranque en la carrera comercial.',
      relatedCampaigns: ['Da+']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'primera_poliza_bonus', 'cumple'], type: 'text' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'bono_grupo_1',
    label: 'Validación Bono Grupo 1',
    description: 'Resultado precalculado de condiciones para el Bono Grupo 1',
    metadata: {
      indicator: 'Bono Grupo 1',
      detailDescription: 'Nivel máximo de productividad',
      detailedExplanation: 'Llave de acceso a premios de Grupo 0 (ej. Palmilla).',
      detailedDefinition: 'Certificación de top productividad en concurso.',
      combinedDetail: 'Requisito crítico junto con metas de prima meta.',
      relatedCampaigns: ['Grupo 0']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'bono_grupo_1', 'cumple'], type: 'text' }
    ],
    scopes: ['goal']
  },
  {
    key: 'mix_vida',
    label: 'Mix de negocio Vida',
    description: 'Mezcla Vida vs resto de líneas del asesor',
    metadata: {
      indicator: 'Mix Vida',
      detailDescription: 'Proporción de Vida',
      detailedExplanation: 'Garantiza balance del portafolio hacia Vida.',
      detailedDefinition: 'Razón de primas Vida / total.',
      combinedDetail: 'Criterio de alineación estratégica de ventas.',
      relatedCampaigns: ['MDRT', 'Convenciones']
    },
    fields: [
      { value: 'ratio', label: 'Ratio Vida', path: ['datasets', 'mix_vida', 'ratio'], type: 'number' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'prima_minima',
    label: 'Validación prima mínima',
    description: 'Validación automática de prima mínima requerida',
    metadata: {
      indicator: 'Prima mínima',
      detailDescription: 'Umbral de prima',
      detailedExplanation: 'Asegura volumen mínimo de negocio exigido por campaña.',
      detailedDefinition: 'Bandera de cumplimiento del umbral.',
      combinedDetail: 'Filtro de elegibilidad por valor acumulado.',
      relatedCampaigns: ['Reto 5000', 'Da+', 'Momentum']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'prima_minima', 'cumple'], type: 'text' },
      { value: 'prima_minima', label: 'Prima minima', path: ['datasets', 'prima_minima', 'prima_minima'], type: 'number' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'msi_inicial',
    label: 'MSI inicial pólizas',
    description: 'Determina si aplica MSI para casos iniciales',
    metadata: {
      indicator: 'MSI inicial',
      detailDescription: 'Pago a MSI en pólizas iniciales',
      detailedExplanation: 'Facilita acceso a clientes con mensualidades sin intereses.',
      detailedDefinition: 'Bandera de elegibilidad MSI inicial.',
      combinedDetail: 'Condición financiera aplicable al caso inicial.',
      relatedCampaigns: ['MSI Inicial']
    },
    fields: [
      { value: 'aplica', label: 'Aplica condición', path: ['datasets', 'msi_inicial', 'aplica'], type: 'text' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'msi_renovacion_gmmi',
    label: 'MSI renovación GMMI',
    description: 'MSI para renovaciones GMMI ya evaluada',
    metadata: {
      indicator: 'MSI renovación',
      detailDescription: 'Pago a MSI en renovaciones',
      detailedExplanation: 'Incentiva continuidad de pólizas GMM Individual.',
      detailedDefinition: 'Bandera MSI aplicable a renovación.',
      combinedDetail: 'Condición financiera en pólizas renovadas.',
      relatedCampaigns: ['MSI Renovación GMM']
    },
    fields: [
      { value: 'aplica', label: 'Aplica condición', path: ['datasets', 'msi_renovacion_gmmi', 'aplica'], type: 'text' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'comisiones_dobles',
    label: 'Convenciones al doble',
    description: 'Marca si las comisiones cuentan doble en la campaña',
    metadata: {
      indicator: 'Comisiones dobles',
      detailDescription: 'Cómputo doble en octubre',
      detailedExplanation: 'Acelera conteo para alcanzar convenciones.',
      detailedDefinition: 'Regla temporal de ponderación x2.',
      combinedDetail: 'Beneficio de impulso de cierre anual.',
      relatedCampaigns: ['Convenciones al Doble']
    },
    fields: [
      { value: 'activo', label: 'Conteo doble activo', path: ['datasets', 'comisiones_dobles', 'activo'], type: 'text' },
      { value: 'mes', label: 'Mes aplicable', path: ['datasets', 'comisiones_dobles', 'mes'], type: 'text' }
    ],
    scopes: ['goal']
  },
  {
    key: 'vida_dolares',
    label: 'Tipo de cambio preferencial (TCP)',
    description: 'Indicador de cumplimiento para objetivos de Vida en dólares',
    metadata: {
      indicator: 'TCP',
      detailDescription: 'Prima en USD con umbral',
      detailedExplanation: 'Acceso a tipo preferencial por volumen en USD.',
      detailedDefinition: 'Bandera de cumplimiento de prima USD.',
      combinedDetail: 'Regla de elegibilidad por monto en dólares.',
      relatedCampaigns: ['TCP']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'vida_dolares', 'cumple'], type: 'text' },
      { value: 'prima_usd', label: 'Prima en USD', path: ['datasets', 'vida_dolares', 'prima_usd'], type: 'number' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'momentum_prima_minima',
    label: 'Momentum prima mínima',
    description: 'Verifica si Momentum alcanzó la prima mínima acumulada',
    metadata: {
      indicator: 'Momentum',
      detailDescription: 'Umbral de prima Momentum',
      detailedExplanation: 'Garantiza volumen inicial requerido por campaña.',
      detailedDefinition: 'Bandera de cumplimiento del recibo mínimo.',
      combinedDetail: 'Filtro de activación de beneficios Momentum.',
      relatedCampaigns: ['Momentum', 'Cierra con Éxito']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'momentum_prima_minima', 'cumple'], type: 'text' },
      { value: 'recibo_minimo_mxn', label: 'Recibo mínimo (MXN)', path: ['datasets', 'momentum_prima_minima', 'recibo_minimo_mxn'], type: 'number' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'region_dcn',
    label: 'Campañas exclusivas DCN',
    description: 'Bandera de pertenencia a la región DCN',
    metadata: {
      indicator: 'Región DCN',
      detailDescription: 'Pertenencia a Dirección Comercial Norte',
      detailedExplanation: 'Aplica únicamente a campañas de la región DCN.',
      detailedDefinition: 'Bandera regional de elegibilidad.',
      combinedDetail: 'Criterio geográfico-organizacional de participación.',
      relatedCampaigns: ['Avalancha GMM', 'Cierra con Éxito', 'Promotor 360° DCN']
    },
    fields: [
      { value: 'es_dcn', label: 'Pertenece a DCN', path: ['datasets', 'region_dcn', 'es_dcn'], type: 'text' }
    ],
    scopes: ['eligibility']
  },
  {
    key: 'meta_comisiones',
    label: 'Meta de comisiones',
    description: 'Estado de la meta de comisiones (avance y objetivo)',
    metadata: {
      indicator: 'Avance vs objetivo',
      detailDescription: 'Progreso de comisiones',
      detailedExplanation: 'Evalúa cumplimiento de metas económicas de campaña.',
      detailedDefinition: 'KPI de avance porcentual vs meta.',
      combinedDetail: 'Control de logro económico para premios.',
      relatedCampaigns: ['Convenciones', 'MDRT', 'Camino a la Cumbre']
    },
    fields: [
      { value: 'meta_cumplida', label: 'Meta cumplida', path: ['datasets', 'meta_comisiones', 'meta_cumplida'], type: 'text' },
      { value: 'avance_actual', label: 'Avance actual (MXN)', path: ['datasets', 'meta_comisiones', 'avance_actual'], type: 'number' },
      { value: 'meta_objetivo', label: 'Meta objetivo (MXN)', path: ['datasets', 'meta_comisiones', 'meta_objetivo'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'ranking_r1',
    label: 'Ranking R1',
    description: 'Posición, estatus y puntos del ranking R1 calculados por la ETL',
    metadata: {
      indicator: 'Ranking R1',
      detailDescription: 'Posición competitiva y nivel del ranking',
      detailedExplanation: 'Ranking mensual que pondera producción, persistencia y consistencia comercial.',
      detailedDefinition: 'Dato consolidado que asigna posición, estatus (Oro, Plata, etc.) y puntos acumulados.',
      combinedDetail: 'Identifica a los asesores líderes para campañas de reconocimiento.',
      relatedCampaigns: ['Ranking R1', 'Reconocimientos regionales']
    },
    fields: [
      { value: 'posicion', label: 'Posición en ranking', path: ['datasets', 'ranking_r1', 'posicion'], type: 'number' },
      { value: 'estatus', label: 'Estatus del ranking', path: ['datasets', 'ranking_r1', 'estatus'], type: 'text' },
      { value: 'puntos', label: 'Puntos acumulados', path: ['datasets', 'ranking_r1', 'puntos'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'promotor_360_index',
    label: 'Promotor 360° nacional',
    description: 'Puntaje y bandera del índice Promotor 360°',
    metadata: {
      indicator: 'Índice Promotor 360°',
      detailDescription: 'Desempeño integral de promotor',
      detailedExplanation: 'Calcula puntos por recluta, retención y proactivos (versión nacional).',
      detailedDefinition: 'Score compuesto con umbrales de cumplimiento.',
      combinedDetail: 'Mide efectividad del promotor en tres ejes.',
      relatedCampaigns: ['Promotor 360°']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'promotor_360_index', 'cumple'], type: 'text' },
      { value: 'puntaje', label: 'Puntaje', path: ['datasets', 'promotor_360_index', 'puntaje'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'promotor_360_dcn_index',
    label: 'Promotor 360° DCN',
    description: 'Versión DCN del índice Promotor 360°',
    metadata: {
      indicator: 'Índice Promotor 360° DCN',
      detailDescription: 'Desempeño integral DCN',
      detailedExplanation: 'Score con parámetros DCN para reconocimiento regional.',
      detailedDefinition: 'Índice adaptado a la región.',
      combinedDetail: 'Medición equivalente con ajustes regionales.',
      relatedCampaigns: ['Promotor 360° DCN']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'promotor_360_dcn_index', 'cumple'], type: 'text' },
      { value: 'puntaje', label: 'Puntaje', path: ['datasets', 'promotor_360_dcn_index', 'puntaje'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'graduados_por_generacion',
    label: 'Graduación asesores',
    description: 'Graduados por generación validados para la campaña',
    metadata: {
      indicator: 'Graduación',
      detailDescription: 'Asesores que alcanzan metas en su clase',
      detailedExplanation: 'Valida generación con metas mínimas para reconocimiento.',
      detailedDefinition: 'Conteo por cohorte con bandera de cumplimiento.',
      combinedDetail: 'Mecanismo de validación por cohortes.',
      relatedCampaigns: ['Graduación (asesores y promotores)']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'graduados_por_generacion', 'cumple'], type: 'text' },
      { value: 'total_generaciones_validas', label: 'Generaciones válidas', path: ['datasets', 'graduados_por_generacion', 'total_generaciones_validas'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'asesores_ganadores',
    label: 'Ganadores de campañas',
    description: 'Consolidado de asesores ganadores asociados',
    metadata: {
      indicator: 'Ganadores',
      detailDescription: 'Asesores que alcanzan premios/metas',
      detailedExplanation: 'Consolidado para reporteo y reconocimientos.',
      detailedDefinition: 'Lista agregada con bandera de logro.',
      combinedDetail: 'Salida de elegibilidad y logros por campaña.',
      relatedCampaigns: ['Convenciones', 'Legión Centurión', 'Grupo 0']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'asesores_ganadores', 'cumple'], type: 'text' },
      { value: 'total', label: 'Total asesores', path: ['datasets', 'asesores_ganadores', 'total'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'creciendo_contigo_score',
    label: 'Creciendo Contigo',
    description: 'Resultado del programa Creciendo Contigo',
    metadata: {
      indicator: 'Score Creciendo Contigo',
      detailDescription: 'Medición basada en RC y retención',
      detailedExplanation: 'Evalúa desempeño del promotor con métricas clave.',
      detailedDefinition: 'Puntaje compuesto del programa.',
      combinedDetail: 'Indicador de avance del promotor.',
      relatedCampaigns: ['Creciendo Contigo']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'creciendo_contigo_score', 'cumple'], type: 'text' },
      { value: 'puntaje', label: 'Puntaje', path: ['datasets', 'creciendo_contigo_score', 'puntaje'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'promotores_asesores_ganadores',
    label: 'Ganadores asociados a promotor',
    description: 'Resumen por promotor de asesores ganadores',
    metadata: {
      indicator: 'Ganadores por promotor',
      detailDescription: 'Consolidado de niveles de logro',
      detailedExplanation: 'Apoya reconocimientos y jerarquías por promotor.',
      detailedDefinition: 'Agregación por cartera de promotor.',
      combinedDetail: 'Vista ejecutiva de desempeño de cartera.',
      relatedCampaigns: ['Convenciones', 'Sociedad Norte']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'promotores_asesores_ganadores', 'cumple'], type: 'text' },
      { value: 'total_asesores', label: 'Total asesores ganadores', path: ['datasets', 'promotores_asesores_ganadores', 'total_asesores'], type: 'number' },
      { value: 'nivel_maximo', label: 'Nivel máximo', path: ['datasets', 'promotores_asesores_ganadores', 'nivel_maximo'], type: 'text' }
    ],
    scopes: ['goal']
  },
  {
    key: 'asesores_proactivos',
    label: 'Indicador de proactividad',
    description: 'Conteo/bandera de asesores catalogados como proactivos',
    metadata: {
      indicator: 'Proactivo',
      detailDescription: 'Asesor vigente con productividad mínima',
      detailedExplanation: 'Relaciona RC y presencia en cortes de productividad.',
      detailedDefinition: 'Bandera por cumplimiento de estándares RC y continuidad.',
      combinedDetail: 'Criterio operativo de calidad del asesor.',
      relatedCampaigns: ['Promotor 360°', 'Sociedad Norte']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'asesores_proactivos', 'cumple'], type: 'text' },
      { value: 'total', label: 'Total proactivos', path: ['datasets', 'asesores_proactivos', 'total'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'asesores_conectados',
    label: 'Conectividad asesores',
    description: 'Conectividad de asesores dentro del rango definido',
    metadata: {
      indicator: 'Conectividad',
      detailDescription: 'Asesores con conexión vigente y actividad mínima',
      detailedExplanation: 'Mide presencia operativa por ventana de tiempo.',
      detailedDefinition: 'Bandera de rango conectado.',
      combinedDetail: 'Control de actividad base para campañas de disciplina.',
      relatedCampaigns: ['Capitanes al Mando']
    },
    fields: [
      { value: 'en_rango', label: 'En rango', path: ['datasets', 'asesores_conectados', 'en_rango'], type: 'text' },
      { value: 'total', label: 'Total conectados', path: ['datasets', 'asesores_conectados', 'total'], type: 'number' }
    ],
    scopes: ['goal']
  },
  {
    key: 'msi_promotor_condiciones',
    label: 'MSI promotor',
    description: 'Condiciones MSI específicas del promotor evaluadas por ETL',
    metadata: {
      indicator: 'MSI promotor',
      detailDescription: 'Condiciones financieras por promotor',
      detailedExplanation: 'Compensa costos bancarios de MSI en su cartera.',
      detailedDefinition: 'Bandera de condiciones específicas por jerarquía.',
      combinedDetail: 'Reglas financieras aplicadas al promotor.',
      relatedCampaigns: ['MSI Promotor']
    },
    fields: [
      { value: 'cumple', label: 'Cumple condición', path: ['datasets', 'msi_promotor_condiciones', 'cumple'], type: 'text' }
    ],
    scopes: ['eligibility']
  }
]

export function getCampaignDatasetDefinition(key: CampaignDatasetKey): CampaignDatasetDefinition | undefined {
  return CAMPAIGN_DATASET_DEFINITIONS.find(entry => entry.key === key)
}

export function getCampaignDatasetDefinitionsByScope(scope: CampaignRuleScope): CampaignDatasetDefinition[] {
  return CAMPAIGN_DATASET_DEFINITIONS.filter(entry => entry.scopes.includes(scope))
}

export function getCampaignDatasetField(dataset: CampaignDatasetKey, field: string): CampaignDatasetField | undefined {
  const definition = getCampaignDatasetDefinition(dataset)
  return definition?.fields.find(entry => entry.value === field)
}

export function isCampaignDatasetKey(value: string): value is CampaignDatasetKey {
  return CAMPAIGN_DATASET_DEFINITIONS.some(entry => entry.key === value)
}
