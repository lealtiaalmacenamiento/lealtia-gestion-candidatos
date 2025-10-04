// Utility to sanitize payloads before persisting to DB
// Removes derived/non-persisted fields that can appear in UI objects

export const DERIVED_CANDIDATO_FIELDS = new Set<string>([
  'dias_desde_pop', // days between today and fecha_creacion_pop (derived)
  'dias_desde_ct',  // days between today and fecha_creacion_ct (derived)
  'proceso',        // server-calculated pipeline stage
]);

export function sanitizeCandidatoPayload<T extends Record<string, unknown>>(obj: T): T {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (DERIVED_CANDIDATO_FIELDS.has(k)) continue;
    if (typeof v === 'undefined') continue;
    (out as Record<string, unknown>)[k] = v as unknown;
  }
  return out as T;
}
