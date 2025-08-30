## Fase 2 (Prospectos & Planificación)

<!-- noop: trigger Vercel deploy (2025-08-29) -->

Resumen rápido de endpoints y estructuras añadidas.

Tablas:
- prospectos(id, agente_id, anio, semana_iso, nombre, telefono, notas, estado, fecha_cita, created_at, updated_at)
- planificaciones(id, agente_id, anio, semana_iso, prima_anual_promedio, porcentaje_comision, bloques[])

Estados prospecto: pendiente | seguimiento | con_cita | descartado.

Endpoints clave:
- GET/POST /api/prospectos (filtros: estado, semana, anio, agente_id*)
- PATCH/DELETE /api/prospectos/:id
- GET /api/prospectos/aggregate (totales y meta 30)
- GET/POST /api/planificacion

Permisos:
- rol agente: siempre restringido a su agente_id.
- superusuario/admin: puede pasar agente_id.

UI:
- /prospectos: formulario rápido, tabla coloreada, filtros, export PDF.
- /planificacion: grid semanal 05-21h, actividades ciclo, cálculo horas citas y ganancia.

Export PDF: botón en Prospectos (usa jsPDF + autotable). Nombre prospectos.pdf.

Completado:
- Selector de agente con listado de nombres (en /prospectos para superusuarios/admin).

Próximos (no implementados todavía):
- Realtime (suscripciones) y validaciones frontend adicionales.
- Mejoras visuales.