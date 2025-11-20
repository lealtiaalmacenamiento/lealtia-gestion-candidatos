"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BasePage from '@/components/BasePage';
import { getUserCampaignDetail } from '@/lib/api';
import type {
  Campaign,
  CampaignProgressStatus,
  UserCampaignDetail
} from '@/types';

interface ProductParameter {
  id: string;
  display_name: string;
}

// Formatters
const numberFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
const currencyFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const percentFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2, minimumFractionDigits: 2 });

// Status configurations
const STATUS_CONFIG: Record<Campaign['status'], { badge: string; label: string }> = {
  draft: { badge: 'bg-secondary', label: 'Borrador' },
  active: { badge: 'bg-success', label: 'Activa' },
  paused: { badge: 'bg-warning text-dark', label: 'Pausada' },
  archived: { badge: 'bg-dark', label: 'Archivada' }
};

const PROGRESS_CONFIG: Record<CampaignProgressStatus, { badge: string; label: string; icon: string }> = {
  not_eligible: { badge: 'bg-secondary', label: 'No elegible', icon: 'x-circle' },
  eligible: { badge: 'bg-info text-dark', label: 'En progreso', icon: 'hourglass-split' },
  completed: { badge: 'bg-success', label: 'Completada', icon: 'check-circle-fill' }
};

// Utility functions
function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return numberFormatter.format(value);
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return currencyFormatter.format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const scaled = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percentFormatter.format(scaled)}%`;
}

function formatDateRange(value?: string | null): string {
  if (!value) return 'No definida';
  const match = value.match(/^\[(.*?),(.*?)\)$/);
  if (!match) return 'No definida';
  const [startRaw, endRaw] = match.slice(1);
  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;
  
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 'No definida';
  }
  
  const dateFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' });
  return `${dateFormatter.format(start)} — ${dateFormatter.format(end)}`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return 'No disponible';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return 'No disponible';
  return new Intl.DateTimeFormat('es-MX', { 
    dateStyle: 'short', 
    timeStyle: 'short' 
  }).format(parsed);
}

// Interfaz para product parameters
interface ProductParameter {
  id: string;
  display_name: string;
}

// Helper para generar descripciones detalladas de requisitos
function buildRequirementDescription(rule: {kind: string; description?: string | null; details?: Record<string, unknown> | null; passed: boolean}, productParameters: ProductParameter[] = []): string {
  const details = rule.details as Record<string, unknown> | undefined;
  
  // Si ya tiene una descripción legible, usarla
  if (rule.description && !rule.description.includes('matchBy') && !rule.description.includes('path')) {
    return rule.description;
  }

  // Manejar TENURE_MONTHS (antigüedad)
  if (rule.kind === 'TENURE_MONTHS' && details) {
    const minMonths = details.min_months as number;
    const role = details.role as string;
    const roleText = role === 'asesor' ? 'asesor' : role === 'promotor' ? 'promotor' : 'participante';
    return `Debes tener al menos ${minMonths} meses de antigüedad como ${roleText}`;
  }

  // Manejar COUNT_POLICIES (contar pólizas)
  if (rule.kind === 'COUNT_POLICIES' && details) {
    const minCount = details.min as number || 1;
    const product = details.product as string;
    const products = details.products as string[];
    const initialOnly = details.initial_only as boolean;
    const minPremium = details.min_premium as number;
    const minTenureMonths = details.min_tenure_months as number;
    
    let description = '';
    const countText = `${minCount} ${minCount === 1 ? 'póliza' : 'pólizas'}`;
    
    if (products && products.length > 0) {
      const productList = products.join(', ');
      description = `Debes emitir al menos ${countText} de: ${productList}`;
    } else if (product) {
      const productName = product.replace(/_/g, ' ').toUpperCase();
      description = `Debes emitir al menos ${countText} de ${productName}`;
    } else {
      description = `Debes emitir al menos ${countText}`;
    }
    
    // Agregar condiciones adicionales
    const conditions: string[] = [];
    if (initialOnly) conditions.push('pólizas iniciales');
    if (minPremium) conditions.push(`prima mínima ${formatCurrency(minPremium)}`);
    if (minTenureMonths) conditions.push(`vigencia mínima ${minTenureMonths} meses`);
    
    if (conditions.length > 0) {
      description += ` (${conditions.join(', ')})`;
    }
    
    return description;
  }

  // Manejar SEGMENT (pertenecer a segmentos)
  if (rule.kind === 'SEGMENT' && details) {
    const include = details.include as string[];
    const exclude = details.exclude as string[];
    const any = details.any as string[];
    const all = details.all as string[];
    
    const parts: string[] = [];
    
    if (all && all.length > 0) {
      parts.push(`Debes pertenecer a todos estos segmentos: ${all.join(', ')}`);
    }
    if (any && any.length > 0) {
      parts.push(`Debes pertenecer a al menos uno de estos segmentos: ${any.join(', ')}`);
    }
    if (include && include.length > 0) {
      parts.push(`Debes pertenecer a: ${include.join(', ')}`);
    }
    if (exclude && exclude.length > 0) {
      parts.push(`No debes pertenecer a: ${exclude.join(', ')}`);
    }
    
    return parts.length > 0 ? parts.join('. ') : 'Debes cumplir con los requisitos de segmentación';
  }

  // Manejar TOTAL_PREMIUM (prima total)
  if (rule.kind === 'TOTAL_PREMIUM' && details) {
    const threshold = details.threshold as number;
    const product = details.product as string;
    const ranking = details.ranking as string;
    const metric = details.metric as string;
    
    let description = '';
    if (ranking) {
      description = `Debes estar en el ${ranking} de productores`;
    } else if (metric === 'commissions') {
      description = `Debes acumular comisiones mínimas de ${formatCurrency(threshold)}`;
    } else if (metric === 'income') {
      description = `Debes alcanzar ingresos mínimos de ${formatCurrency(threshold)}`;
    } else {
      description = `Debes alcanzar una prima mínima de ${formatCurrency(threshold)}`;
    }
    
    if (product) {
      description += ` en ${product.toUpperCase()}`;
    }
    
    return description;
  }

  // Manejar INDEX_THRESHOLD (índices LIMRA/IGC)
  if (rule.kind === 'INDEX_THRESHOLD' && details) {
    const indices = details.indices as Array<{name: string; field: string; max: number}>;
    if (indices && indices.length > 0) {
      const indexDescriptions = indices.map(idx => 
        `${idx.name} ≤ ${formatPercent(idx.max)}`
      ).join(' y ');
      return `Debes mantener índices de cancelación dentro de los parámetros: ${indexDescriptions}`;
    }
    return 'Debes cumplir con los índices de cancelación requeridos';
  }

  // Manejar RC_COUNT (reclutas de calidad para promotores)
  if (rule.kind === 'RC_COUNT' && details) {
    const min = details.min as number;
    const polizasVidaMensuales = details.polizas_vida_mensuales as number;
    const primaMin = details.prima_min_mxn as number;
    
    let description = `Debes reclutar al menos ${min} ${min === 1 ? 'asesor' : 'asesores'} de calidad`;
    if (polizasVidaMensuales || primaMin) {
      description += ' (';
      const requirements: string[] = [];
      if (polizasVidaMensuales) {
        requirements.push(`${polizasVidaMensuales} pólizas Vida/mes`);
      }
      if (primaMin) {
        requirements.push(`prima anual ≥ ${formatCurrency(primaMin)}`);
      }
      description += requirements.join(', ') + ')';
    }
    
    const detalles = details.detalles as Record<string, number> | undefined;
    if (detalles && (detalles.min_current || detalles.min_primera)) {
      const parts: string[] = [];
      if (detalles.min_current) parts.push(`${detalles.min_current} Current`);
      if (detalles.min_primera) parts.push(`${detalles.min_primera} 1a Clase`);
      if (parts.length > 0) {
        description += `. Mínimo: ${parts.join(' + ')}`;
      }
    }
    
    return description;
  }

  // Si no hay detalles, retornar descripción genérica mejorada
  if (!details) {
    return 'Debes cumplir con este requisito para participar en la campaña';
  }

  // Extraer información común
  const dataset = String(details.dataset || '');
  const field = String(details.field || '');
  const operator = String(details.operator || '');
  const actual = details.actual;
  const expected = details.expected;
  
  // Manejar casos especiales de METRIC_CONDITION con definiciones
  const definition = details.definition as string | undefined;
  
  // Clasificación de asesor
  if (definition === 'clasificacion_asesor' && details.permitidos) {
    const permitidos = details.permitidos as string[];
    const permitidosTexto = permitidos.map(p => {
      if (p === 'nuevo') return 'nuevos';
      if (p === 'reactivado') return 'reactivados';
      if (p === 'activo') return 'activos';
      if (p === '12m') return 'con al menos 12 meses';
      if (p === 'consolidado') return 'consolidados';
      return p;
    }).join(', ');
    return `Solo asesores ${permitidosTexto} pueden participar`;
  }
  
  // Primera póliza con bonus
  if (definition === 'primera_poliza_bonus') {
    const minPrimaVida = details.min_prima_vida as number;
    const minPrimaAccidentes = details.min_prima_accidentes as number;
    let desc = 'Debes emitir tu primera póliza válida';
    if (minPrimaVida || minPrimaAccidentes) {
      desc += ' con prima mínima de ';
      const parts: string[] = [];
      if (minPrimaVida) parts.push(`${formatCurrency(minPrimaVida)} para Vida Grupo`);
      if (minPrimaAccidentes) parts.push(`${formatCurrency(minPrimaAccidentes)} para Accidentes`);
      desc += parts.join(' o ');
    }
    return desc;
  }
  
  // Bono Grupo 1
  if (definition === 'bono_grupo_1' && details.meses_requeridos) {
    const meses = details.meses_requeridos as string[];
    return `Debes cumplir el Bono Grupo 1 en: ${meses.join(', ')}`;
  }
  
  // MSI Inicialión GMMI
  if (definition === 'comisiones_dobles' && details.period) {
    const period = details.period as string;
    return `Las comisiones iniciales cuentan al doble durante ${period}`;
  }
  
  // Momentum prima mínima
  if (definition === 'region_dcn') {
    return 'Campaña exclusiva para la Dirección Comercial Norte (DCN)';
  }
  
  // Promotor 360 Index
  if (definition === 'promotor_360_index' && details.ponderacion) {
    return 'Debes cumplir con el indicador compuesto de RC, altas, proactivos y graduados';
  }
  
  // Mix Vida
  if (definition === 'mix_vida' && details.min_ratio) {
    const minRatio = details.min_ratio as number;
    return `Al menos ${formatPercent(minRatio)} de tu negocio debe ser Vida`;
  }

  // Mapeo de operadores a frases en español
  const operatorMap: Record<string, string> = {
    'eq': 'igual a',
    'neq': 'diferente de',
    'gt': 'mayor que',
    'gte': 'mayor o igual a',
    'lt': 'menor que',
    'lte': 'menor o igual a',
    'contains': 'que contenga',
    'not_contains': 'que no contenga',
    'in': 'uno de los siguientes'
  };

  // Formatear valores según tipo
  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return 'N/A';
    if (typeof val === 'number') {
      if (field.includes('porcentaje') || field.includes('vigencia') || field.includes('indice')) {
        return formatPercent(val);
      }
      if (field.includes('prima') || field.includes('monto')) {
        return formatCurrency(val);
      }
      return formatNumber(val);
    }
    return String(val);
  };

  // Nombres amigables para datasets
  const datasetNames: Record<string, string> = {
    'candidatos': 'Candidatos',
    'polizas': 'Pólizas',
    'polizas_por_producto': 'Pólizas por Producto',
    'rc': 'Reclutamiento',
    'cancelaciones': 'Cancelaciones'
  };

  // Nombres amigables para campos
  const fieldNames: Record<string, string> = {
    'ultimo_mes_conexion': 'mes de última conexión',
    'polizas_vigentes': 'número de pólizas vigentes',
    'cantidad': 'cantidad de pólizas',
    'producto_ids': 'productos específicos',
    'reclutas_calidad': 'reclutas de calidad',
    'rc_vigencia': 'RC de vigencia',
    'indice_limra': 'índice LIMRA',
    'momentum_neto': 'momentum neto'
  };

  const datasetName = datasetNames[dataset] || dataset;
  const fieldName = fieldNames[field] || field;
  const operatorText = operatorMap[operator] || operator;
  
  // Formatear el valor esperado, mapeando UIDs de productos a nombres si aplica
  let expectedFormatted = formatValue(expected);
  if (field === 'producto_ids' && operator === 'in' && productParameters.length > 0) {
    const valueList = Array.isArray(expected) ? expected : (typeof expected === 'string' ? expected.split(',').map((v: string) => v.trim()) : [expected]);
    const mappedValues = valueList.map((v: unknown) => {
      const strValue = String(v);
      const product = productParameters.find(p => p.id === strValue);
      return product ? product.display_name : strValue;
    });
    expectedFormatted = mappedValues.join(', ');
  }
  
  const actualFormatted = formatValue(actual);

  // Construir descripción específica
  let description = '';

  if (dataset && field) {
    if (operator === 'in') {
      description = `Debes tener ${fieldName} de ${datasetName} que sea ${operatorText}: ${expectedFormatted}`;
    } else if (expected !== null && expected !== undefined) {
      description = `Debes tener ${fieldName} ${operatorText} ${expectedFormatted} en ${datasetName}`;
    } else {
      description = `Debes cumplir con el requisito de ${fieldName} en ${datasetName}`;
    }

    // Agregar valor actual si existe
    if (actual !== null && actual !== undefined) {
      description += `. Actualmente tienes: ${actualFormatted}`;
    }
  } else {
    description = 'Debes cumplir con este requisito para participar';
  }

  return description;
}

// Helper para generar recomendaciones de acción
function buildActionRecommendation(rule: {passed: boolean; kind: string; details?: Record<string, unknown> | null}): string {
  const details = rule.details;

  // Si ya cumple, felicitar
  if (rule.passed) {
    return '¡Excelente! Ya cumples con este requisito';
  }

  // Recomendaciones específicas por tipo de regla
  if (rule.kind === 'TENURE_MONTHS') {
    return 'Continúa trabajando para cumplir con el tiempo de antigüedad requerido';
  }

  if (rule.kind === 'COUNT_POLICIES') {
    const minCount = details?.min as number || 1;
    return `Emite las pólizas necesarias para alcanzar el mínimo de ${minCount}`;
  }

  if (rule.kind === 'SEGMENT') {
    return 'Verifica que pertenezcas a los segmentos requeridos para esta campaña';
  }

  if (rule.kind === 'TOTAL_PREMIUM') {
    const metric = details?.metric as string;
    if (metric === 'commissions') {
      return 'Trabaja en aumentar tus comisiones para alcanzar el objetivo';
    } else if (metric === 'income') {
      return 'Trabaja en aumentar tus ingresos para alcanzar el objetivo';
    }
    return 'Trabaja en aumentar tu prima emitida para alcanzar el objetivo';
  }

  if (rule.kind === 'INDEX_THRESHOLD') {
    return 'Trabaja en reducir tus índices de cancelación para cumplir con los parámetros';
  }

  if (rule.kind === 'RC_COUNT') {
    return 'Recluta más asesores de calidad que cumplan con los requisitos establecidos';
  }

  if (!details) return '';

  const field = String(details.field || '');
  const actual = details.actual;
  const expected = details.expected;

  // Generar recomendación específica basada en el campo
  const recommendations: Record<string, string> = {
    'ultimo_mes_conexion': 'Asegúrate de registrar tu conexión mensual en el sistema',
    'polizas_vigentes': 'Trabaja en emitir y mantener más pólizas vigentes',
    'cantidad': 'Aumenta el número de pólizas emitidas',
    'producto_ids': 'Emite pólizas de los productos específicos requeridos',
    'reclutas_calidad': 'Enfócate en reclutar más asesores de calidad',
    'rc_vigencia': 'Mejora la vigencia de tus reclutas',
    'indice_limra': 'Trabaja en reducir las cancelaciones tempranas',
    'momentum_neto': 'Mantén un balance positivo entre emisiones y cancelaciones'
  };

  const recommendation = recommendations[field];
  
  if (recommendation) {
    // Si tenemos valores numéricos, ser más específico
    if (typeof actual === 'number' && typeof expected === 'number') {
      const diff = expected - actual;
      if (diff > 0) {
        if (field.includes('polizas') || field.includes('reclutas')) {
          return `${recommendation}. Te faltan ${formatNumber(diff)} para alcanzar la meta`;
        } else if (field.includes('porcentaje') || field.includes('indice') || field.includes('vigencia')) {
          return `${recommendation}. Necesitas mejorar ${formatPercent(diff / 100)} para alcanzar la meta`;
        }
      }
    }
    return recommendation;
  }

  // Recomendación genérica
  return 'Trabaja en cumplir este requisito para avanzar en la campaña';
}

export default function CampaignDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const router = useRouter();

  const [campaign, setCampaign] = useState<UserCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productParameters, setProductParameters] = useState<ProductParameter[]>([]);

  // Cargar parámetros de productos
  useEffect(() => {
    const loadProductParameters = async () => {
      try {
        const response = await fetch('/api/admin/product-parameters');
        if (response.ok) {
          const data = await response.json();
          setProductParameters(data || []);
        }
      } catch (err) {
        console.error('Error loading product parameters:', err);
      }
    };
    loadProductParameters();
  }, []);

  const loadCampaign = useCallback(async (silent = false) => {
    if (!slug) {
      setError('Campaña no encontrada');
      setLoading(false);
      return;
    }

    setError(null);
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await getUserCampaignDetail(slug);
      setCampaign(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cargar la campaña';
      setError(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  // Derived data
  const status = campaign ? STATUS_CONFIG[campaign.campaign.status] : null;
  const progress = campaign ? PROGRESS_CONFIG[campaign.evaluation.status] : null;
  const progressPercent = campaign ? Math.round(campaign.evaluation.progress * 100) : 0;

  // Requirement lists
  const eligibilityRules = useMemo(() => {
    return campaign?.evaluation.ruleResults.filter(r => r.scope === 'eligibility') ?? [];
  }, [campaign]);

  const goalRules = useMemo(() => {
    return campaign?.evaluation.ruleResults.filter(r => r.scope === 'goal') ?? [];
  }, [campaign]);

  if (loading) {
    return (
      <BasePage title="Cargando campaña...">
        <div className="text-center py-5">
          <div className="spinner-border text-primary mb-3" role="status">
            <span className="visually-hidden">Cargando...</span>
          </div>
          <p className="text-muted">Cargando información de la campaña</p>
        </div>
      </BasePage>
    );
  }

  if (error) {
    return (
      <BasePage title="Error">
        <div className="d-flex flex-column gap-3">
          <button 
            type="button" 
            className="btn btn-link align-self-start px-0"
            onClick={() => router.push('/campanias')}
          >
            <i className="bi bi-arrow-left"></i> Volver a campañas
          </button>
          <div className="alert alert-danger">
            <i className="bi bi-exclamation-triangle-fill me-2"></i>
            {error}
          </div>
        </div>
      </BasePage>
    );
  }

  if (!campaign) {
    return (
      <BasePage title="Campaña no encontrada">
        <div className="d-flex flex-column gap-3">
          <button 
            type="button" 
            className="btn btn-link align-self-start px-0"
            onClick={() => router.push('/campanias')}
          >
            <i className="bi bi-arrow-left"></i> Volver a campañas
          </button>
          <div className="alert alert-warning">
            <i className="bi bi-info-circle-fill me-2"></i>
            No se encontró la campaña solicitada
          </div>
        </div>
      </BasePage>
    );
  }

  return (
    <BasePage title={campaign.campaign.name}>
      <style jsx>{`
        .hover-shadow {
          transition: all 0.3s ease;
        }
        .hover-shadow:hover {
          transform: translateY(-4px);
          box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15) !important;
        }
        .transition {
          transition: all 0.3s ease;
        }
      `}</style>
      
      {/* Header con acciones */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <button 
          type="button" 
          className="btn btn-link px-0"
          onClick={() => router.push('/campanias')}
        >
          <i className="bi bi-arrow-left"></i> Volver a campañas
        </button>
        <div className="d-flex align-items-center gap-2">
          {status && (
            <span className={`badge ${status.badge}`}>
              {status.label}
            </span>
          )}
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => loadCampaign(true)}
            disabled={refreshing}
          >
            {refreshing ? (
              <><span className="spinner-border spinner-border-sm me-2"></span>Actualizando</>
            ) : (
              <><i className="bi bi-arrow-clockwise me-2"></i>Actualizar</>
            )}
          </button>
        </div>
      </div>

      {/* Hero / Encabezado principal */}
      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3 mb-4">
            <div className="flex-grow-1">
              <h2 className="mb-2">{campaign.campaign.name}</h2>
              {campaign.campaign.summary && (
                <p className="text-muted mb-3">{campaign.campaign.summary}</p>
              )}
              <div className="d-flex flex-wrap gap-2">
                {campaign.segments.primary && (
                  <span className="badge bg-primary">
                    <i className="bi bi-star-fill me-1"></i>
                    {campaign.segments.primary.name}
                  </span>
                )}
                {campaign.segments.additional.map(seg => (
                  <span key={seg.id} className="badge bg-secondary">
                    {seg.name}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-md-end">
              {progress && (
                <div className="mb-2">
                  <span className={`badge ${progress.badge} fs-6`}>
                    <i className={`bi bi-${progress.icon} me-1`}></i>
                    {progress.label}
                  </span>
                </div>
              )}
              <div className="small text-muted">
                {campaign.cache.snapshotEvaluatedAt ? (
                  <>Evaluación: {formatDateTime(campaign.cache.snapshotEvaluatedAt)}</>
                ) : (
                  <>Evaluación en tiempo real</>
                )}
              </div>
              <div className="small text-muted">
                Vigencia: {formatDateRange(campaign.campaign.active_range)}
              </div>
            </div>
          </div>

          {/* Barra de progreso mejorada */}
          <div className="bg-light rounded-3 p-3 mb-3">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div>
                <span className="fw-semibold text-dark">Progreso de la campaña</span>
                {campaign.evaluation.status === 'completed' && (
                  <span className="ms-2 badge bg-success">
                    <i className="bi bi-trophy-fill me-1"></i>Completada
                  </span>
                )}
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="fs-4 fw-bold text-primary">{progressPercent}%</span>
              </div>
            </div>
            <div className="progress" style={{ height: '28px' }}>
              <div
                className={`progress-bar progress-bar-striped ${
                  campaign.evaluation.status === 'completed' ? 'bg-success progress-bar-animated' :
                  campaign.evaluation.status === 'eligible' ? 'bg-info' :
                  'bg-secondary'
                }`}
                role="progressbar"
                style={{ width: `${progressPercent}%` }}
                aria-valuenow={progressPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <span className="px-2">{progressPercent}%</span>
              </div>
            </div>
            <div className="d-flex justify-content-between mt-2 small text-muted">
              <span>
                {campaign.evaluation.status === 'completed' ? '🎉 ¡Meta alcanzada!' :
                 campaign.evaluation.status === 'eligible' ? '📈 Sigue avanzando' :
                 '⏸ Verifica elegibilidad'}
              </span>
              <span>Meta: 100%</span>
            </div>
          </div>

        </div>
      </div>

      {/* Sección de Requisitos con tabs */}
      <div className="card shadow-sm mb-4">
        <div className="card-header bg-white">
          <h5 className="mb-0">
            <i className="bi bi-list-check me-2"></i>
            Requisitos y Objetivos
          </h5>
        </div>
        <div className="card-body">
          {eligibilityRules.length === 0 && goalRules.length === 0 ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-info-circle fs-1 d-block mb-3 opacity-50"></i>
              <p className="mb-0">No hay requisitos configurados para esta campaña</p>
            </div>
          ) : (
            <>
              {/* Resumen de estado */}
              <div className="row g-3 mb-4">
                <div className="col-md-6">
                  <div className={`border rounded p-3 ${eligibilityRules.every(r => r.passed) ? 'border-success bg-success-subtle' : 'border-warning bg-warning-subtle'}`}>
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <div className="text-muted small mb-1">Elegibilidad</div>
                        <div className="fs-4 fw-bold">
                          {eligibilityRules.filter(r => r.passed).length} / {eligibilityRules.length}
                        </div>
                      </div>
                      <i className={`bi ${eligibilityRules.every(r => r.passed) ? 'bi-shield-check-fill text-success' : 'bi-shield-exclamation text-warning'} fs-1`}></i>
                    </div>
                    <div className="small mt-2">
                      {eligibilityRules.every(r => r.passed) ? (
                        <span className="text-success fw-semibold">✓ Cumples con todos los requisitos</span>
                      ) : (
                        <span className="text-warning fw-semibold">⚠ Requisitos pendientes</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="col-md-6">
                  <div className={`border rounded p-3 ${goalRules.every(r => r.passed) ? 'border-success bg-success-subtle' : 'border-info bg-info-subtle'}`}>
                    <div className="d-flex align-items-center justify-content-between">
                      <div>
                        <div className="text-muted small mb-1">Objetivos</div>
                        <div className="fs-4 fw-bold">
                          {goalRules.filter(r => r.passed).length} / {goalRules.length}
                        </div>
                      </div>
                      <i className={`bi ${goalRules.every(r => r.passed) ? 'bi-trophy-fill text-success' : 'bi-target fs-1 text-info'}`}></i>
                    </div>
                    <div className="small mt-2">
                      {goalRules.every(r => r.passed) ? (
                        <span className="text-success fw-semibold">🎯 ¡Todas las metas alcanzadas!</span>
                      ) : (
                        <span className="text-info fw-semibold">📊 En progreso</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Detalles de Elegibilidad */}
              {eligibilityRules.length > 0 && (
                <div className="mb-4">
                  <h6 className="text-primary mb-3 d-flex align-items-center">
                    <i className="bi bi-shield-check me-2"></i>
                    Requisitos de Elegibilidad
                    <span className="badge bg-primary ms-2">{eligibilityRules.length}</span>
                  </h6>
                  <div className="alert alert-info mb-3">
                    <i className="bi bi-info-circle-fill me-2"></i>
                    <strong>Importante:</strong> Debes cumplir TODOS estos requisitos para poder participar en la campaña
                  </div>
                  <div className="d-flex flex-column gap-3">
                    {eligibilityRules.map((rule, idx) => {
                      const description = buildRequirementDescription(rule, productParameters);
                      const actionText = buildActionRecommendation(rule);
                      
                      return (
                        <div
                          key={rule.id || idx}
                          className={`border-2 rounded-3 p-4 ${rule.passed ? 'border-success bg-success-subtle' : 'border-warning bg-warning-subtle'}`}
                        >
                          <div className="d-flex gap-3">
                            <div className="flex-shrink-0">
                              <div className={`rounded-circle d-flex align-items-center justify-content-center ${rule.passed ? 'bg-success' : 'bg-warning'}`} style={{ width: '50px', height: '50px' }}>
                                <i className={`bi ${rule.passed ? 'bi-check-lg text-white' : 'bi-exclamation-lg text-dark'} fs-4`}></i>
                              </div>
                            </div>
                            <div className="flex-grow-1">
                              {/* Estado */}
                              <div className={`fw-bold mb-2 d-flex align-items-center gap-2 ${rule.passed ? 'text-success' : 'text-warning-emphasis'}`}>
                                {rule.passed ? (
                                  <>
                                    <i className="bi bi-check-circle-fill"></i>
                                    Requisito Cumplido
                                  </>
                                ) : (
                                  <>
                                    <i className="bi bi-exclamation-circle-fill"></i>
                                    Requisito Pendiente
                                  </>
                                )}
                              </div>
                              
                              {/* Descripción detallada */}
                              <div className="mb-2">
                                <div className="fw-semibold text-dark mb-1">Qué necesitas:</div>
                                <p className="mb-0">{description}</p>
                              </div>

                              {/* Recomendación de acción */}
                              {actionText && (
                                <div className={`mt-3 p-3 rounded ${rule.passed ? 'bg-success bg-opacity-10 border border-success' : 'bg-warning bg-opacity-10 border border-warning'}`}>
                                  <div className="d-flex align-items-start gap-2">
                                    <i className={`bi ${rule.passed ? 'bi-lightbulb-fill text-success' : 'bi-arrow-right-circle-fill text-warning'} fs-5 flex-shrink-0`}></i>
                                    <div className="flex-grow-1">
                                      <div className="small fw-semibold mb-1">
                                        {rule.passed ? '¡Bien hecho!' : 'Qué hacer:'}
                                      </div>
                                      <div className="small">{actionText}</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detalles de Objetivos */}
              {goalRules.length > 0 && (
                <div>
                  <h6 className="text-success mb-3 d-flex align-items-center">
                    <i className="bi bi-trophy me-2"></i>
                    Objetivos y Metas
                    <span className="badge bg-success ms-2">{goalRules.length}</span>
                  </h6>
                  <div className="alert alert-success mb-3">
                    <i className="bi bi-star-fill me-2"></i>
                    <strong>Tu reto:</strong> Alcanza estas metas para desbloquear las recompensas de la campaña
                  </div>
                  <div className="d-flex flex-column gap-3">
                    {goalRules.map((rule, idx) => {
                      const description = buildRequirementDescription(rule, productParameters);
                      const actionText = buildActionRecommendation(rule);
                      const details = rule.details as Record<string, unknown> | undefined;
                      
                      return (
                        <div
                          key={rule.id || idx}
                          className={`border-2 rounded-3 p-4 ${rule.passed ? 'border-success bg-success-subtle' : 'border-info bg-info-subtle'}`}
                        >
                          <div className="d-flex gap-3">
                            <div className="flex-shrink-0">
                              <div className={`rounded-circle d-flex align-items-center justify-content-center ${rule.passed ? 'bg-success' : 'bg-info'}`} style={{ width: '50px', height: '50px' }}>
                                <i className={`bi ${rule.passed ? 'bi-check-lg text-white' : 'bi-target text-white'} fs-4`}></i>
                              </div>
                            </div>
                            <div className="flex-grow-1">
                              {/* Estado */}
                              <div className={`fw-bold mb-2 d-flex align-items-center gap-2 ${rule.passed ? 'text-success' : 'text-info-emphasis'}`}>
                                {rule.passed ? (
                                  <>
                                    <i className="bi bi-trophy-fill"></i>
                                    ¡Meta Alcanzada!
                                  </>
                                ) : (
                                  <>
                                    <i className="bi bi-hourglass-split"></i>
                                    En Progreso
                                  </>
                                )}
                              </div>
                              
                              {/* Descripción detallada */}
                              <div className="mb-2">
                                <div className="fw-semibold text-dark mb-1">Tu objetivo:</div>
                                <p className="mb-0">{description}</p>
                              </div>

                              {/* Recomendación de acción */}
                              {actionText && (
                                <div className={`mt-3 p-3 rounded ${rule.passed ? 'bg-success bg-opacity-10 border border-success' : 'bg-info bg-opacity-10 border border-info'}`}>
                                  <div className="d-flex align-items-start gap-2">
                                    <i className={`bi ${rule.passed ? 'bi-trophy-fill text-success' : 'bi-bullseye text-info'} fs-5 flex-shrink-0`}></i>
                                    <div className="flex-grow-1">
                                      <div className="small fw-semibold mb-1">
                                        {rule.passed ? '¡Excelente trabajo!' : 'Sigue así:'}
                                      </div>
                                      <div className="small">{actionText}</div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Barra de progreso visual si hay valores numéricos */}
                              {details && typeof details.actual_value === 'number' && typeof details.expected_value === 'number' && (
                                <div className="mt-3">
                                  <div className="d-flex justify-content-between align-items-center mb-1">
                                    <span className="small text-muted">Tu progreso</span>
                                    <span className="small fw-semibold">
                                      {Math.min(100, Math.round((details.actual_value / details.expected_value) * 100))}%
                                    </span>
                                  </div>
                                  <div className="progress" style={{ height: '8px' }}>
                                    <div
                                      className={`progress-bar ${rule.passed ? 'bg-success' : 'bg-info'}`}
                                      role="progressbar"
                                      style={{ width: `${Math.min(100, Math.round((details.actual_value / details.expected_value) * 100))}%` }}
                                      aria-valuenow={details.actual_value}
                                      aria-valuemin={0}
                                      aria-valuemax={details.expected_value}
                                    ></div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Sección de Recompensas mejorada */}
      {campaign.rewards.length > 0 && (
        <div className="card shadow-sm mb-4 border-0">
          <div className="card-header bg-gradient text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <div className="d-flex align-items-center justify-content-between">
              <h5 className="mb-0">
                <i className="bi bi-gift-fill me-2"></i>
                Recompensas de la Campaña
              </h5>
              <span className="badge bg-white text-primary">{campaign.rewards.length}</span>
            </div>
          </div>
          <div className="card-body p-4">
            <p className="text-muted mb-4">
              <i className="bi bi-info-circle me-2"></i>
              Estas son las recompensas que obtendrás al completar los objetivos de la campaña
            </p>
            <div className="row g-4">
              {campaign.rewards.map((reward) => (
                <div key={reward.id} className="col-12 col-lg-6">
                  <div className="card h-100 border-warning border-2 shadow-sm hover-shadow transition">
                    <div className="card-body p-4">
                      <div className="d-flex gap-3">
                        <div className="flex-shrink-0">
                          <div className="bg-warning bg-opacity-10 rounded-circle d-flex align-items-center justify-content-center" style={{ width: '60px', height: '60px' }}>
                            <i className="bi bi-trophy-fill text-warning fs-3"></i>
                          </div>
                        </div>
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-start justify-content-between mb-2">
                            <h5 className="mb-0">{reward.title}</h5>
                            {reward.is_accumulative && (
                              <span className="badge bg-info">
                                <i className="bi bi-arrow-repeat me-1"></i>
                                Acumulativa
                              </span>
                            )}
                          </div>
                          {reward.description && (
                            <p className="text-muted mb-0 mt-2">{reward.description}</p>
                          )}
                          {!reward.description && (
                            <p className="text-muted mb-0 mt-2 fst-italic">Recompensa disponible al completar la campaña</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="card-footer bg-warning bg-opacity-10 border-0 text-center">
                      <small className="text-muted">
                        {goalRules.every(r => r.passed) ? (
                          <span className="text-success fw-semibold">
                            <i className="bi bi-check-circle-fill me-1"></i>
                            ¡Recompensa desbloqueada!
                          </span>
                        ) : (
                          <span>
                            <i className="bi bi-lock-fill me-1"></i>
                            Completa los objetivos para desbloquear
                          </span>
                        )}
                      </small>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Descripción y Notas */}
      {(campaign.campaign.description || campaign.campaign.notes) && (
        <div className="card shadow-sm">
          <div className="card-header bg-white">
            <h5 className="mb-0">
              <i className="bi bi-info-circle me-2"></i>
              Información Adicional
            </h5>
          </div>
          <div className="card-body">
            {campaign.campaign.description && (
              <div className="mb-3">
                <h6 className="text-muted">Descripción</h6>
                <p className="mb-0">{campaign.campaign.description}</p>
              </div>
            )}
            {campaign.campaign.notes && (
              <div>
                <h6 className="text-muted">Notas</h6>
                <p className="mb-0">{campaign.campaign.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </BasePage>
  );
}
