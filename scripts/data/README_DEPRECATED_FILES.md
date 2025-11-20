# Archivos Deprecados - vida_grupo_inicial

⚠️ **NOTA IMPORTANTE**: Los siguientes archivos contienen referencias al dataset `vida_grupo_inicial` que fue **eliminado completamente** del sistema.

## Archivos Afectados

### 1. `campaign_custom_metrics_sample.json`
- **Estado**: Deprecado
- **Razón**: Contiene métricas de `vida_grupo_inicial`
- **Alternativas**:
  ```json
  // En lugar de:
  {
    "dataset": "vida_grupo_inicial",
    "metrics": {
      "polizas_validas": 2,
      "ultimas_ventas_dias": 8
    }
  }
  
  // Usar:
  {
    "dataset": "polizas_por_tipo",
    "metrics": { "cantidad": 2 }
  },
  {
    "dataset": "polizas_recientes",
    "metrics": { "ultima_emision_dias": 8, "cantidad": 2 }
  }
  ```

### 2. `campaigns_2025.json`
- **Estado**: Deprecado (parcial)
- **Razón**: Campaña "Reto 5000" usa `vida_grupo_inicial`
- **Acción**: Actualizar reglas de campaña usando `update-reto5000-rules.sql`

### 3. `update-reto5000-rules.sql`
- **Estado**: Script de migración disponible
- **Propósito**: Reemplaza reglas de `vida_grupo_inicial` por datasets granulares

## Datasets Granulares Disponibles

El dataset monolítico `vida_grupo_inicial` fue reemplazado por:

1. **`polizas_por_tipo`**: Filtra pólizas por tipos específicos (VI, VU, etc.)
2. **`polizas_prima_minima`**: Valida pólizas con prima >= umbral
3. **`polizas_recientes`**: Pólizas emitidas en ventana temporal

## Migraciones Completadas

- ✅ **campaignDatasetRegistry.ts**: Dataset eliminado
- ✅ **CampaignWizard.tsx**: Referencias de UI eliminadas
- ✅ **migrate-vida-grupo-to-granular-datasets.ts**: Marcado como deprecado

## Próximos Pasos

Si tienes campañas activas usando `vida_grupo_inicial`:

1. Ejecutar `update-reto5000-rules.sql` para migrar reglas existentes
2. Actualizar cualquier script ETL que genere estas métricas
3. Usar los datasets granulares para nuevas campañas
