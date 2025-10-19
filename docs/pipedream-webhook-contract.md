# Contrato Webhook Agenda ↔ Pipedream

Este documento describe el contrato de integración entre la aplicación de agenda (origen) y el workflow de Pipedream (destino) encargado de automatizar acciones con proveedores externos como Zoom. Toda petición que no cumpla con estas reglas debe rechazarse con un error explícito.

## Autenticación y seguridad
- **URL destino**: `${PIPELINE_WEBHOOK_URL}` (configurable vía entorno).
- **Encabezado requerido**: `x-signature`.
- **Algoritmo**: HMAC-SHA256 sobre el cuerpo crudo de la solicitud.
- **Secreto compartido**: `${PIPELINE_WEBHOOK_SECRET}` (mismo valor en la app y en Pipedream).
- **Comparación**: realizar comparación estricta (cadenas hex minúsculas). Si falta el encabezado o la firma no coincide, responder con `401` o `403`.

## Esquema general del body
```json
{
  "action": "create_zoom_meeting",
  "provider": "zoom",
  "cita": {
    "id": 123,
    "inicio": "2025-10-18T16:00:00.000Z",
    "fin": "2025-10-18T17:00:00.000Z",
    "timezone": "America/Mexico_City",
    "notas": "Revisión de pólizas",
    "prospecto": {
      "id": 456,
      "nombre": "María Pérez",
      "email": "maria@example.com"
    # Integración Pipedream (deprecated)

    El flujo de agenda ya no usa Pipedream para crear reuniones de Zoom. Todas las citas con proveedores distintos a Google Meet se capturan manualmente desde la aplicación (enlace personal de Zoom o Teams). Este archivo se conserva únicamente como referencia histórica.
  {
