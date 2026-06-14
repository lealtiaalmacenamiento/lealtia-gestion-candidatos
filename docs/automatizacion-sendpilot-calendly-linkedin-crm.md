# Automatización SendPilot → Cal.com → CRM

> **Fecha de diseño:** Abril 2026  
> **Estado:** Diseño completo — validación técnica de fuentes oficiales completada  
> **Scope definitivo:** SendPilot (bidireccional) + Cal.com (webhooks + citas CRM). LinkedIn no requiere integración API directa — SendPilot opera sobre LinkedIn nativamente.

### Estado de validación por plataforma

| Plataforma | Estado | Fuente |
|---|---|---|
| **Cal.com** | ✅ Validado | `cal.com/docs/api-reference/v2` — OAuth 2.0 (requiere aprobación), webhooks HMAC-SHA256, prefill por identifier |
| **SendPilot** | ✅ Validado | `docs.sendpilot.ai` — Webhooks nativos + API bidireccional (push leads, inbox, campañas) |
| **LinkedIn** | ✅ Evaluado | Sin API directa necesaria — SendPilot gestiona LinkedIn (ICP, mensajes, InMails) de forma nativa |

> **¿Por qué Cal.com y no Calendly?** Calendly requiere plan de pago (~$10/mes/usuario) para acceder a webhooks y API. Cal.com ofrece webhooks, OAuth y API en plan gratuito.

---

## 1. Visión General del Flujo

```
┌─────────────────────────────────────────────────────┐
│              SendPilot (sobre LinkedIn)              │
│  ICP search → Secuencia → Mensajes → Link Cal.com   │
└──────────┬──────────────────────────┬───────────────┘
           │ webhooks (→ CRM)          │ API bidireccional (← CRM)
           │ connection.sent          │ POST /leads
           │ message.received         │ PUT /leads/{id}
           │ lead.status.changed      │ POST /campaigns/{id}/pause
           │ campaign.*               │ GET /inbox
           ▼                          ▼
┌──────────────────────────────────────────────────────┐
│                   CRM (este repo)                    │
│   sp_precandidatos · sp_campanas · sp_actividades    │
│   citas · candidatos · métricas                      │
└──────────────────┬───────────────────────────────────┘
                   │ webhooks
         ┌─────────┴──────────┐
         ▼                    ▼
    BOOKING_CREATED      BOOKING_CANCELLED
    (crea cita en        (actualiza cita
     tabla citas)         en tabla citas)
         ▲
    Cal.com
    (link enviado por SP en la secuencia;
     pre-candidato agenda desde fuera del CRM)
```

### Responsabilidades por sistema

| Sistema | Rol |
|---|---|
| **SendPilot** | ICP search en LinkedIn, gestión de la secuencia de mensajes, envío del link de Cal.com (vía redirect CRM), estados internos propios. Acepta comandos del CRM vía API |
| **Cal.com** | Agendamiento de citas (el pre-candidato agenda desde el link de la secuencia). Sincroniza con la tabla `citas` del CRM vía webhook `BOOKING_CREATED` |
| **LinkedIn** | Red social donde SendPilot opera. **No se integra directamente** — SendPilot actúa como intermediario |
| **CRM (este repo)** | Espejo de eventos para visibilidad; métricas; operaciones bidireccionales sobre SP (push leads, control de campañas, inbox); conversión pre-candidato → candidato |

### Principio clave
> **SendPilot es dueño de sus propios estados internos.** El CRM refleja eventos vía webhooks Y puede enviar comandos a SP vía API (push de leads, pausa de campañas, respuesta a mensajes). La fuente de verdad de los estados de LinkedIn/InMail siempre es SendPilot.

---

## 2. Flujo Detallado

### Paso 1 — ICP Search en SendPilot
- El reclutador configura un ICP (Ideal Candidate Profile) en SendPilot
- SendPilot busca perfiles de LinkedIn que coincidan
- Los contactos encontrados son añadidos a una campaña de SendPilot

### Paso 2 — Secuencia de mensajes
- SendPilot ejecuta la secuencia automáticamente (InMails, mensajes LinkedIn, emails)
- En un paso de la secuencia se envía el link redirect del CRM (que a su vez lleva a Cal.com con prefill de linkedin_url)

### Paso 3 — Agendamiento vía Cal.com
- El pre-candidato hace clic en el link, el CRM redirige a Cal.com con su linkedin_url pre-rellenado
- Cal.com dispara webhook `BOOKING_CREATED` al CRM

### Paso 4 — Espejo en CRM
- El CRM recibe el webhook de Cal.com
- Busca el pre-candidato por `linkedin_url` (matching por slug, sección 11)
- Elimina búsqueda por email como clave primaria — el email llega en el booking pero el matching es por linkedin_url
- Crea una entrada en la tabla `citas`
- Actualiza `sp_precandidatos.estado = 'cita_agendada'`
- Notifica al reclutador vía email (mailer.ts)

### Paso 5 — Conversación / Llamada
- El reclutador realiza la entrevista
- Puede registrar notas en el perfil del pre-candidato en el CRM

### Paso 6 — Promoción manual
- Botón "Promover a Candidato" en el CRM
- Pre-llena el formulario de nuevo candidato con datos del pre-candidato
- Al guardar: se crea registro en `candidatos` y se vincula mediante `sp_precandidatos.candidato_id`

---

## 3. Stack Técnico

- **Framework:** Next.js 14 (App Router), TypeScript  
- **Base de datos:** Supabase (PostgreSQL) — RLS habilitado  
- **Auth:** Supabase Auth + OAuth propio vía `integrationTokens.ts` con cifrado AES  
- **Email:** `src/lib/mailer.ts`  
- **Cifrado:** `src/lib/encryption.ts`  
- **Logging/Auditoría:** `src/lib/logger.ts` con función `logAccion`

---

## 4. Nuevas Tablas de Base de Datos

### 4.1 `sp_campanas`

```sql
CREATE TABLE sp_campanas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sendpilot_campaign_id       text UNIQUE,
  nombre                      text NOT NULL,
  slug                        text UNIQUE,
  -- Slug legible para la URL del redirect: 'reclutamiento-2026q1'
  -- URL en SP: https://crm.lealtia.mx/api/cal/{slug}/{{contact.id}}
  -- La misma URL para todos los candidatos de la campaña;
  -- el CRM resuelve cuál reclutador asignar al momento del redirect.
  descripcion_icp             text,
  segment_id                  uuid REFERENCES segments(id),
  estado                      text DEFAULT 'activa',
  -- activa | pausada | finalizada
  calcom_linkedin_identifier  text DEFAULT 'LinkedIn',
  -- Identifier del campo LinkedIn en Cal.com (case-sensitive).
  -- Aplica a todos los reclutadores de la campaña (deben tener el mismo identifier).
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);
-- NOTA: calcom_scheduling_url y calcom_event_type_id se eliminan de sp_campanas.
-- Ahora viven en sp_campana_reclutadores (uno por reclutador por campaña).
```

### 4.1-B `sp_campana_reclutadores`

> **Nueva tabla** — permite múltiples reclutadores por campaña, cada uno con su propia URL y event type de Cal.com.

```sql
CREATE TABLE sp_campana_reclutadores (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campana_id            uuid NOT NULL REFERENCES sp_campanas(id) ON DELETE CASCADE,
  reclutador_id         uuid NOT NULL REFERENCES auth.users(id),
  -- Reclutador asignado a esta campaña (debe tener Cal.com conectado en tokens_integracion)
  calcom_scheduling_url text NOT NULL,
  -- URL de agendamiento de ESTE reclutador para ESTA campaña
  -- Ej: 'https://cal.com/paola-pecina/30min'
  calcom_event_type_id  text NOT NULL,
  -- ID del event type de Cal.com de ESTE reclutador para ESTA campaña
  -- Se obtiene de GET /v2/event-types y se selecciona en la UI al configurar
  activo                boolean DEFAULT true,
  -- false = el reclutador fue desasignado pero los precandidatos existentes quedan vinculados
  UNIQUE (campana_id, reclutador_id)
);
```

**Asignación de reclutador al pre-candidato:**
Cuando llega `connection.sent` de SP, el CRM asigna automáticamente un reclutador al pre-candidato (round-robin entre los reclutadores activos de la campaña):

```typescript
// Al recibir connection.sent:
const reclutadores = await supabase
  .from('sp_campana_reclutadores')
  .select('reclutador_id')
  .eq('campana_id', campanaId)
  .eq('activo', true);

// Round-robin: reclutar al que tiene menos pre-candidatos activos
const counts = await Promise.all(
  reclutadores.data.map(r => supabase
    .from('sp_precandidatos')
    .select('id', { count: 'exact' })
    .eq('reclutador_id', r.reclutador_id)
    .in('estado', ['en_secuencia', 'respondio', 'link_enviado', 'cita_agendada'])
  )
);
const asignado = reclutadores.data[counts.indexOf(Math.min(...counts.map(c => c.count ?? 0)))];
```

### 4.2 `sp_precandidatos`

```sql
CREATE TABLE sp_precandidatos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sendpilot_contact_id  text,
  -- ⚠️ Sin UNIQUE global: el mismo contacto puede estar en múltiples campañas.
  --    El UNIQUE se aplica compuesto (sendpilot_contact_id, campana_id).
  campana_id            uuid REFERENCES sp_campanas(id),
  reclutador_id         uuid REFERENCES auth.users(id),
  -- Reclutador asignado a ESTE pre-candidato (asignado en connection.sent, round-robin)
  -- Puede diferir del asesor del segmento si hay múltiples reclutadores en la campaña
  UNIQUE (sendpilot_contact_id, campana_id),
  nombre                text NOT NULL,
  email                 text,           -- nullable: se enriquece progresivamente; garantizado en BOOKING_CREATED
  linkedin_url          text NOT NULL,  -- URL canónica: https://www.linkedin.com/in/{slug}
  linkedin_urn          text,           -- ID interno LinkedIn (ACoAAC...) — nunca cambia
  empresa               text,
  cargo                 text,
  estado                text NOT NULL DEFAULT 'en_secuencia',
  -- en_secuencia | respondio | link_enviado | cita_agendada
  -- llamada_realizada | no_interesado | promovido
  paso_actual           int DEFAULT 0,
  fecha_ultimo_evento   timestamptz,
  calcom_booking_uid    text,
  cita_id               int REFERENCES citas(id),
  candidato_id          int REFERENCES candidatos(id_candidato),
  fecha_promocion       timestamptz,
  notas_reclutador      text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);
```

### 4.3 `sp_actividades`

```sql
CREATE TABLE sp_actividades (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  precandidato_id uuid REFERENCES sp_precandidatos(id) ON DELETE CASCADE,
  tipo            text NOT NULL,
  -- SendPilot: 'sp_contacto_agregado', 'sp_mensaje_enviado',
  --            'sp_respuesta_recibida', 'sp_link_enviado', 'sp_paso_n'
  -- Cal.com:   'cita_agendada', 'cita_cancelada', 'calcom_link_click'
  -- Manual:    'nota_reclutador', 'promovido_a_candidato', 'descartado'
  descripcion     text,
  metadata        jsonb,  -- payload completo del webhook
  origen          text DEFAULT 'sendpilot',
  -- sendpilot | calcom | manual
  created_at      timestamptz DEFAULT now()
);
```

---

## 5. Archivos Nuevos a Crear

### Webhooks

| Archivo | Descripción |
|---|---|
| `src/app/api/webhooks/sendpilot/route.ts` | Recibe eventos de SendPilot, crea/actualiza `sp_precandidatos` e inserta en `sp_actividades` |
| `src/app/api/webhooks/calcom/route.ts` | Recibe `BOOKING_CREATED` y `BOOKING_CANCELLED`, crea cita, actualiza pre-candidato |

### Redirect de Cal.com para SP

| Archivo | Descripción |
|---|---|
| `src/app/api/cal/[campaignSlug]/[contactId]/route.ts` | Endpoint de redirección — resuelve campaña por slug + `linkedin_url` del pre-candidato → 302 a Cal.com con prefill. Ver sección 11-B |

### OAuth y callbacks

| Archivo | Descripción |
|---|---|
| `src/app/api/integraciones/calcom/callback/route.ts` | ⚠️ **Requerido** — recibe redirect OAuth de Cal.com, intercambia code por tokens, registra webhook en cuenta del reclutador, guarda en `tokens_integracion` con `username`/`webhook_id`/`webhook_secret` en `meta` |

### API pre-candidatos

| Archivo | Descripción |
|---|---|
| `src/app/api/precandidatos/route.ts` | CRUD de pre-candidatos |
| `src/app/api/precandidatos/[id]/promover/route.ts` | Endpoint de promoción a candidato |

### Integración SendPilot

| Archivo | Descripción |
|---|---|
| `src/lib/integrations/sendpilot.ts` | Cliente API bidireccional (todos los métodos de salida) + verificación de firma de webhooks |
| `src/app/api/sendpilot/campaigns/route.ts` | GET campañas, PATCH pause/resume |
| `src/app/api/sendpilot/leads/route.ts` | POST — añadir lead a campaña desde CRM |
| `src/app/api/sendpilot/leads/[id]/route.ts` | PUT — actualizar estado de lead desde CRM |
| `src/app/api/sendpilot/inbox/route.ts` | GET inbox (mensajes LinkedIn centralizados) |
| `src/app/api/sendpilot/inbox/[threadId]/reply/route.ts` | POST — responder mensaje desde CRM |
| `src/app/api/integraciones/sendpilot/route.ts` | Guardar API key de SendPilot |

### Páginas UI

| Archivo | Descripción |
|---|---|
| `src/app/(private)/precandidatos/page.tsx` | Vista de embudo + tabla de pre-candidatos |
| `src/app/(private)/precandidatos/[id]/page.tsx` | Detalle + timeline de actividades + botón promover + botón "Añadir a campaña SP" |
| `src/app/(private)/campanias/sendpilot/page.tsx` | Dashboard de campañas SP con controles pause/resume desde CRM |
| `src/app/(private)/campanias/sendpilot/inbox/page.tsx` | Inbox centralizado de mensajes LinkedIn |

### Migración

| Archivo | Descripción |
|---|---|
| `supabase/migrations/YYYYMMDD_sp_precandidatos.sql` | Migración con las 3 nuevas tablas |

---

## 6. Archivos Existentes a Modificar

### `src/app/(private)/parametros/SegmentsSection.tsx` + tabla `segments`
- Añadir campo `reclutador_id uuid REFERENCES auth.users(id)` a la tabla `segments` (migración)
- En la UI de segmentos, añadir un selector **"Reclutador de reclutamiento (SP)"** — dropdown de usuarios con rol `agente` o `supervisor` que tengan Cal.com conectado
- Este reclutador es quien recibe los pre-candidatos y citas de todas las campañas SP vinculadas al segmento

### `src/app/(private)/integraciones/page.tsx` (sección Cal.com)
- Añadir sección **"Cal.com"** con botón "Conectar con Cal.com" (OAuth)
- Mientras el OAuth client está en aprobación (estado pending): formulario de API key como fallback
- Tras conectar, el agente ve sus event types mediante `GET https://api.cal.com/v2/event-types`
- Puede marcar uno como **"predeterminado para citas de prospectos SP"** — se guarda en `meta->>'default_event_type_id'` del token
- Al crear una cita de prospecto manualmente en el CRM, el link generado incluye los datos del prospecto pre-rellenados vía el identifier configurado en la campaña

### `src/lib/integrations/oauth.ts`
- Agregar proveedor Cal.com:
```typescript
calcom: {
  authUrl: 'https://app.cal.com/auth/oauth2/authorize',
  tokenUrl: 'https://api.cal.com/v2/auth/oauth2/token',
  scopes: ['BOOKING_READ', 'EVENT_TYPE_READ', 'PROFILE_READ'],
  clientId: process.env.CALCOM_CLIENT_ID!,
  clientSecret: process.env.CALCOM_CLIENT_SECRET!,
}
// ⚠️ El OAuth client de Cal.com requiere aprobación manual por el equipo de Cal.com
// (Settings → Developer → OAuth → estado 'pending' hasta aprobación)
```

### `src/lib/integrationTokens.ts`
- Agregar `'calcom' | 'sendpilot'` al union type del proveedor
- Agregar campo `meta jsonb` para almacenar `organizer_email`, `username`, `webhook_id`, `webhook_secret`, `expires_at`, `default_event_type_id`

### `src/types/supabase.ts`
- Agregar types para `sp_campanas`, `sp_precandidatos`, `sp_actividades`

### `supabase/migrations/YYYYMMDD_citas_provider_calcom.sql` (migración adicional)
- ⚠️ La tabla `citas` existente tiene `meeting_provider` con enum `'google_meet' | 'zoom' | 'teams'`. Para almacenar citas de Cal.com se necesita añadir `'calcom'` al tipo:
```sql
-- Si es un tipo ENUM de Postgres:
ALTER TYPE meeting_provider_enum ADD VALUE 'calcom';
-- Si es un CHECK constraint o columna text con constraint:
ALTER TABLE citas DROP CONSTRAINT IF EXISTS citas_meeting_provider_check;
ALTER TABLE citas ADD CONSTRAINT citas_meeting_provider_check
  CHECK (meeting_provider IN ('google_meet', 'zoom', 'teams', 'calcom'));
```
- También actualizar el tipo TypeScript en `supabase.ts`: `meeting_provider: 'google_meet' | 'zoom' | 'teams' | 'calcom'`

---

## 7. Variables de Entorno Necesarias

```env
# Cal.com OAuth (requiere aprobación del equipo de Cal.com antes de poder usarse)
CALCOM_CLIENT_ID=
CALCOM_CLIENT_SECRET=
CALCOM_REDIRECT_URI=https://tu-dominio.com/api/integraciones/calcom/callback

# SendPilot
SENDPILOT_API_KEY=
SENDPILOT_WEBHOOK_SECRET=
```

---

## 8. Cal.com API v2 — Referencia

**Base URL API:** `https://api.cal.com/v2`  
**OAuth Authorization URL:** `https://app.cal.com/auth/oauth2/authorize`  
**OAuth Token URL:** `https://api.cal.com/v2/auth/oauth2/token`  
**Auth header (con access_token):** `Authorization: Bearer {access_token}`

> ⚠️ **OAuth requiere aprobación manual** del equipo de Cal.com antes de poder usarse. Registrar la app en `app.cal.com/settings/developer/oauth` → queda en estado "pending". Usar API key como fallback mientras se espera.

### Endpoints utilizados

> ⚠️ **Header requerido en todas las llamadas a la API:** `cal-api-version: {fecha}` (valor específico por endpoint). Sin este header la API responde con una versión antigua.

```
GET  /v2/me
     Header: cal-api-version: 2024-06-14
     → Obtener email y username del reclutador tras OAuth
     → Guardar 'organizer_email' en meta (se usa como clave de resolución en webhooks)

POST /v2/webhooks
     Header: cal-api-version: 2024-06-14
     Body: { active: true, subscriberUrl, triggers: [...], secret: "{webhook_secret}" }
     → El campo del body se llama 'secret' (no 'webhook_secret')
     → Registrar al completar OAuth con triggers: ["BOOKING_CREATED", "BOOKING_CANCELLED", "BOOKING_RESCHEDULED"]

DELETE /v2/webhooks/{webhookId}
     Header: cal-api-version: 2024-06-14
     → Des-registrar webhook al desconectar

GET  /v2/event-types
     Header: cal-api-version: 2024-06-14
     → Listar event types del reclutador para selector UI en CRM

GET  /v2/bookings/{bookingUid}
     Header: cal-api-version: 2026-02-25
     → Obtener detalles de un booking (hora inicio/fin, respuestas)

POST /v2/bookings/{bookingUid}/cancel
     Header: cal-api-version: 2024-06-14
     → Cancelar cita desde el CRM
```

### Verificación de firma del webhook

```
Header: x-cal-signature-256: {hmac-hex}

Mensaje firmado: raw_body completo
Algoritmo: HMAC-SHA256 con webhook_secret (generado al registrar el webhook)
```

```typescript
function verifyCalcomSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret: string
): boolean {
  if (!signatureHeader) return false;

  const computed = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(computed, 'hex'),
    Buffer.from(signatureHeader, 'hex')
  );
}
```

> ⚠️ **Pendiente validar:** capturar un payload real de `BOOKING_CREATED` para confirmar el formato exacto del header `x-cal-signature-256` (hex vs base64) antes de implementar.

### Webhook events suscritos

| Evento | Trigger |
|---|---|
| `BOOKING_CREATED` | Pre-candidato agendó una cita |
| `BOOKING_CANCELLED` | Pre-candidato canceló una cita |

### Estructura del payload `BOOKING_CREATED`

```json
{
  "triggerEvent": "BOOKING_CREATED",
  "payload": {
    "uid": "booking-uid-abc123",
    "startTime": "2026-04-10T15:00:00Z",
    "endTime": "2026-04-10T15:30:00Z",
    "title": "Reunión de 30 min",
    "organizer": {
      "username": "paola-pecina",  // ⚠️ NO documentado en estructura Person oficial
      "email": "paola@lealtia.mx"   // ✅ garantizado — usar como clave de resolución
    },
    "attendees": [
      { "name": "Juan Pérez", "email": "juan@empresa.com" }
    ],
    // ⚠️ Campo de respuestas: verificar nombre real con payload capturado
    // Posibles variantes: 'responses', 'bookingFieldsResponses', 'booking.responses'
    "responses": {
      "LinkedIn": { "label": "LikedIn URL", "value": "https://www.linkedin.com/in/..." }
    },
    // URL de reunión (Cal Video / Google Meet): en metadata.videoCallUrl
    "metadata": { "videoCallUrl": "https://..." },
    // uid del booking: puede ser 'uid' o 'bookingUid' según versión del webhook
    "uid": "booking-uid-abc123"  // usar fallback: payload.uid ?? payload.bookingUid
    // ⚠️ Shape de 'responses', 'uid' y 'eventTypeId' no confirmados — ver sección 17.3
  }
}
```

> **Importante:** `organizer.email` se usa como clave para asociar el booking al reclutador en el CRM (buscar en `tokens_integracion WHERE meta->>'organizer_email' = organizer.email AND proveedor = 'calcom'`). `organizer.username` puede usarse como dato de referencia pero **no está garantizado** en la estructura Person de Cal.com webhooks.

### OAuth token response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
  "token_type": "bearer",
  "expires_in": 1800,
  "scope": "BOOKING_READ EVENT_TYPE_READ PROFILE_READ"
}
```
> **Access tokens expiran en 30 minutos** (`expires_in: 1800`) — usar refresh token. Guardar `access_token`, `refresh_token`, `organizer_email` (de `/v2/me`), `webhook_id` y `webhook_secret` en `tokens_integracion.meta jsonb`.

---

## 9. SendPilot — Referencia

> ✅ **Validado desde fuente oficial:** `docs.sendpilot.ai` — SendPilot **tiene webhooks nativos**, firma HMAC-SHA256, reintentos automáticos. No se requiere polling.

**Base URL:** `https://api.sendpilot.ai/v1`  
**Auth:** Header `X-API-Key: YOUR_API_KEY`  
**Webhooks:** Configurables desde el dashboard → Integrations → API Keys

### Eventos reales de webhook

| Evento SendPilot | Acción en CRM |
|---|---|
| `connection.sent` | Crear `sp_precandidatos` con `estado = 'en_secuencia'` |
| `connection.accepted` | Actualizar `estado = 'respondio'`, insertar `sp_actividades` |
| `message.sent` | Insertar `sp_actividades` (tipo: `sp_mensaje_enviado`) |
| `message.received` | Actualizar `estado = 'respondio'`, insertar `sp_actividades` |
| `lead.status.changed` | Sincronizar estado, insertar `sp_actividades` |
| `campaign.started` | Crear/activar `sp_campanas` |
| `campaign.paused` | Actualizar `sp_campanas.estado = 'pausada'` |
| `campaign.resumed` | Actualizar `sp_campanas.estado = 'activa'` |

> **Nota:** Los eventos de secuencia avanzada (`link_enviado`, `paso_n`) se derivan del evento `lead.status.changed` según el estado del lead en SP.

### Estructura del payload de webhook

```json
{
  "eventId": "evt_1708456789123_abc123def",
  "eventType": "message.received",
  "timestamp": "2024-02-24T10:30:00.000Z",
  "workspaceId": "ws_abc123xyz",
  "data": {
    // datos específicos del evento
  }
}
```

### Verificación de firma del webhook

```
Header: Webhook-Signature: v1,t=1708456789,s=abc123...

Mensaje firmado: {timestamp}.{raw_body}
Algoritmo: HMAC-SHA256 con webhook_secret
```

```typescript
function verifySendPilotSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  const parts = signatureHeader.split(',');
  const t = parts.find(p => p.startsWith('t='))?.slice(2);
  const s = parts.find(p => p.startsWith('s='))?.slice(2);
  if (!t || !s) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(s),
    Buffer.from(expected)
  );
}
```

### Delivery y reintentos

- Timeout: 30 segundos para responder
- Éxito: cualquier respuesta 2xx
- Reintentos: 5 intentos con backoff exponencial (5s → 30s → 2min → 15min → 1h)
- Idempotencia: usar `eventId` para evitar procesamiento duplicado

### Registro de API key y webhook secret
```typescript
// POST /api/integraciones/sendpilot
// Body: { api_key: string, webhook_secret: string }
// Guarda cifrado en tokens_integracion con proveedor = 'sendpilot'
// webhook_secret se usa para verificar firma en /api/webhooks/sendpilot
```

---

## 10. LinkedIn — Posición en la arquitectura

> **Sin integración API directa.** SendPilot opera sobre LinkedIn de forma nativa (ICP search, conexiones, mensajes, InMails). El CRM recibe toda la actividad de LinkedIn indirectamente a través de los webhooks de SendPilot.

| Capa | Quién lo gestiona |
|---|---|
| Búsqueda de perfiles por ICP | SendPilot (accede a LinkedIn internamente) |
| Envío de solicitudes de conexión | SendPilot |
| Mensajes / InMails | SendPilot (respuestas visibles en el CRM vía Inbox API bidireccional) |
| Historial de actividad en LinkedIn | `sp_actividades` espejado desde webhooks de SP |

No se requiere ninguna credencial ni app de LinkedIn en este proyecto.

---

## 10-B. SendPilot Bidireccional — Referencia

> El CRM puede **enviar comandos a SendPilot** además de recibir webhooks. Esto permite gestionar campañas y leads directamente desde el CRM sin abrir SendPilot.

**Base URL:** `https://api.sendpilot.ai/v1`  
**Auth:** `X-API-Key: YOUR_API_KEY`

### Endpoints de salida (CRM → SendPilot)

#### Agregar un lead a una campaña
```
POST /leads
Content-Type: application/json
X-API-Key: ...

{
  "campaignId": "sp_camp_abc123",
  "firstName": "Juan",
  "lastName": "Pérez",
  "linkedinUrl": "https://linkedin.com/in/juanperez",
  "email": "juan@empresa.com",
  "company": "Empresa SA",
  "title": "Gerente de Operaciones"
}
```
> Usar cuando el reclutador identifica un candidato en el CRM y quiere añadirlo a una campaña SP directamente, sin salir del CRM.

#### Actualizar estado de un lead
```
PUT /leads/{sendpilot_contact_id}
{
  "status": "not_interested"  // o cualquier estado interno SP
}
```

#### Pausar una campaña
```
POST /campaigns/{sendpilot_campaign_id}/pause
```

#### Reanudar una campaña
```
POST /campaigns/{sendpilot_campaign_id}/resume
```

#### Leer mensajes del inbox (LinkedIn messages)
```
GET /inbox?campaignId={id}&limit=50&cursor={cursor}
```
Respuesta incluye: `leadId`, `linkedinUrl`, `messages[]` con `direction` (sent/received), `content`, `sentAt`.

#### Responder a un mensaje desde el CRM
```
POST /inbox/{thread_id}/reply
{
  "message": "Gracias por tu respuesta. ¿Tienes disponibilidad el martes?"
}
```

### Flujos bidireccionales habilitados

| Acción desde CRM | Endpoint SP | Resultado |
|---|---|---|
| "Añadir a campaña" (botón en perfil pre-candidato) | `POST /leads` | Lead aparece en SP automáticamente |
| "Descartar" en CRM | `PUT /leads/{id}` status = not_interested | SP lo marca y detiene la secuencia |
| "Pausar campaña" desde dashboard CRM | `POST /campaigns/{id}/pause` | Secuencia detenida en SP sin entrar a SP |
| "Reanudar campaña" desde dashboard CRM | `POST /campaigns/{id}/resume` | Secuencia reanudada en SP |
| Panel de Inbox en CRM | `GET /inbox` | Mensajes de LinkedIn centralizados en CRM |
| Responder mensaje en CRM | `POST /inbox/{thread}/reply` | Mensaje enviado como InMail desde SP |

### Nuevo archivo requerido
```
src/lib/integrations/sendpilot.ts   ← cliente API con todos estos métodos
```
```typescript
// Ejemplo de firma del cliente
export const sendpilotClient = {
  addLead(campaignId: string, lead: SPLeadInput): Promise<SPLead>
  updateLeadStatus(contactId: string, status: string): Promise<void>
  pauseCampaign(campaignId: string): Promise<void>
  resumeCampaign(campaignId: string): Promise<void>
  getInbox(params: SPInboxParams): Promise<SPInboxPage>
  replyToThread(threadId: string, message: string): Promise<void>
}
```

---

## 11. Clave de Enlace entre Sistemas

> ⚠️ **Error de diseño corregido:** el email de LinkedIn **no es fiable** como clave de enlace entre SP y Cal.com. LinkedIn no expone el email en la mayoría de perfiles. En la etapa `connection.sent`, SP tiene garantizado: `linkedinUrl` (en formato interno), `nombre`, `empresa`, `cargo`.

### Formato real de la URL en SendPilot

SP expone los perfiles de LinkedIn en este formato interno:

```
in/jose-alberto-cano-luna-053ab71a4?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAC_caT8Bdhxazez6frCpWNi_m_finB8YV8E
```

Contiene dos identificadores con características distintas:

| Parte | Ejemplo | ¿Estable? |
|---|---|---|
| **Slug** (`in/{slug}`) | `jose-alberto-cano-luna-053ab71a4` | ❌ Puede cambiar si la persona edita su URL de LinkedIn |
| **miniProfileUrn** (ID interno) | `ACoAAC_caT8Bdhxazez6frCpWNi_m_finB8YV8E` | ✅ Nunca cambia — es el ID único interno de LinkedIn |

### Estrategia: almacenar ambos, matchear por URN

Al recibir `connection.sent` de SP se procesan los dos valores y se almacenan por separado:

```typescript
// URL cruda de SP:
// "in/jose-alberto-cano-luna-053ab71a4?miniProfileUrn=urn%3Ali%3Afs_miniProfile%3AACoAAC..."

function parseSpLinkedinUrl(rawUrl: string) {
  const url = new URL('https://www.linkedin.com/' + rawUrl);

  // linkedin_url: URL canónica limpia (para prefill de Cal.com)
  const slug = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  const linkedin_url = `https://www.linkedin.com/${slug}`;

  // linkedin_urn: ID estable (para matching en webhook de Cal.com)
  const urnEncoded = url.searchParams.get('miniProfileUrn') ?? '';
  const urnDecoded = decodeURIComponent(urnEncoded);
  // "urn:li:fs_miniProfile:ACoAAC_caT8Bdhxazez6frCpWNi_m_finB8YV8E"
  const linkedin_urn = urnDecoded.split(':').pop() ?? null;
  // → "ACoAAC_caT8Bdhxazez6frCpWNi_m_finB8YV8E"

  return { linkedin_url, linkedin_urn };
}
```

### Campos en `sp_precandidatos`

```sql
CREATE TABLE sp_precandidatos (
  ...
  email                 text,          -- nullable: se rellena cuando agenda
  linkedin_url          text NOT NULL, -- URL canónica: https://www.linkedin.com/in/{slug}
  linkedin_urn          text,          -- ID interno LinkedIn (ACoAAC...) — nunca cambia
  ...
);
```

### Link de Cal.com que SP envía en la secuencia

**Importante:** SP incluye en el mensaje un link al CRM (endpoint redirect), *no* el link directo a Cal.com. El CRM construye la URL final con el prefill del candidato y redirige. Esto evita que SP tenga que conocer el identifier de Cal.com o hacer URL-encoding de merge tags.

URL final generada por el redirect (confirmada ✅):
```
https://cal.com/paola-pecina/30min?LinkedIn=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fjose-alberto-cano-luna-053ab71a4
```

- **Identifier confirmado:** `LinkedIn` (L mayúscula — tal como está configurado en Cal.com → Advanced → Booking Questions → Edit → campo Identifier)
- Se usa la `linkedin_url` canónica (sin miniProfileUrn) → el candidato reconoce su propio perfil
- Activar **"Disable input if the URL identifier is prefilled"** en Cal.com evita que el candidato modifique el campo
- Label visible: "LikedIn URL", placeholder: "Ingresa el URL de tu perfil", tipo Short Text, requerida ✅

### El problema: un reclutador puede tener múltiples event types en Cal.com

Si el reclutador tiene varios eventos (ej. "Llamada 30 min", "Entrevista 1h", "Follow-up"), el CRM recibe el webhook de **todos ellos** porque el webhook se suscribe a nivel de cuenta. Sin un filtro, el CRM trataría una cita personal como si fuera del embudo de SP.

**Solución: `sp_campana_reclutadores.calcom_event_type_id`** — al asignar un reclutador a una campaña, se selecciona cuál de sus event types corresponde a esa campaña. El CRM lista las opciones con:

```
GET https://api.cal.com/v2/event-types
Authorization: Bearer {access_token}
```

El `eventTypeId` llega en todos los payloads de Cal.com `BOOKING_CREATED`:
```json
{
  "triggerEvent": "BOOKING_CREATED",
  "payload": {
    "uid": "booking-uid-abc123",
    "eventTypeId": 12345,
    "organizer": { "username": "paola-pecina" },
    ...
  }
}
```

### Lógica de matching en webhook de Cal.com

El matching se hace en **tres pasos en cascada**:

```
Paso 1: ¿El eventTypeId pertenece a alguna campaña activa de SP?
   → No → Cita regular (personal, interna, etc.) → solo crear citas
   → Sí → continuar

Paso 2: ¿Hay linkedin_url en responses.{identifier}?
   → No → Cita orgánica sin prefill → solo crear citas
   → Sí → continuar

Paso 3: ¿Existe un sp_precandidato con esa linkedin_url + campana_id?
   → No → El slug cambió o acceso directo → solo crear citas
   → Sí → Cita de embudo → actualizar sp_precandidato + crear cita vinculada
```

```typescript
// payload = BOOKING_CREATED de Cal.com
// ⚠️ Campos con variantes según versión del webhook — usar fallbacks hasta confirmar con payload real
const eventTypeId: number = payload.eventTypeId ?? payload.eventType?.id;
const bookingUid: string = payload.uid ?? payload.bookingUid;
const organizerEmail: string = payload.organizer.email; // email está garantizado en Person structure
// NOTA: payload.organizer.username NO está documentado en la estructura Person de Cal.com
// La resolución del reclutador usa email (campo garantizado y único en el CRM)

// Resolver reclutador por email del organizador
// Nota: Supabase JS — usar .filter() para comparar dentro de jsonb
const { data: token } = await supabase
  .from('tokens_integracion')
  .select('usuario_id, meta')
  .eq('proveedor', 'calcom')
  .filter('meta->>organizer_email', 'eq', organizerEmail)
  .single();
// 'organizer_email' = email del reclutador en Cal.com, guardado en meta al hacer OAuth

if (!token) return new Response('Unknown organizer', { status: 200 });

// Verificar firma HMAC con el webhook_secret del reclutador
const webhookSecret = token.meta.webhook_secret;
const isValid = verifyCalcomSignature(rawBody, signatureHeader, webhookSecret);
if (!isValid) return new Response('Invalid signature', { status: 401 });

const asesorAuthId = token.usuario_id;

// Paso 1: ¿Este event type pertenece a una campaña activa DE ESTE RECLUTADOR?
const { data: asignacion } = await supabase
  .from('sp_campana_reclutadores')
  .select('campana_id, calcom_linkedin_identifier:sp_campanas(calcom_linkedin_identifier)')
  .eq('calcom_event_type_id', String(eventTypeId))
  .eq('reclutador_id', asesorAuthId)
  .eq('activo', true)
  .maybeSingle();
// Nota: el join trae calcom_linkedin_identifier desde sp_campanas

if (!asignacion) {
  // Cita regular del reclutador (no asociada a ninguna campaña de SP activa)
  await crearCitaSimple({ payload, asesorAuthId });
  return new Response('ok', { status: 200 });
}

const identifier = (asignacion.calcom_linkedin_identifier as { calcom_linkedin_identifier: string } | null)?.calcom_linkedin_identifier ?? 'LinkedIn';
const campanaId: string = asignacion.campana_id;

// Paso 2: Extraer linkedin_url usando el identifier de la campaña
const identifier_val = identifier; // ya resuelto desde sp_campanas vía join
// Intentar todas las variantes conocidas del campo de respuestas del webhook
const responsesRaw = payload.responses ?? payload.bookingFieldsResponses ?? payload.booking?.responses;
const linkedinRaw = extractLinkedinUrl(responsesRaw, identifier_val);

function extractLinkedinUrl(responses: unknown, identifier: string): string | null {
  if (!responses || typeof responses !== 'object') return null;
  // Shape A: objeto con keys = identifiers (Cal.com v2 esperado)
  if (!Array.isArray(responses)) {
    const r = responses as Record<string, { value?: string }>;
    return r[identifier]?.value ?? null;
  }
  // Shape B: array con .identifier
  const arr = responses as Array<{ identifier?: string; label?: string; value?: string }>;
  const found = arr.find(r => r.identifier === identifier || r.label === identifier);
  return found?.value ?? null;
  // Shape C (bookingFieldsResponses): objeto plano { [identifier]: value }
  // Si ninguno funciona, se captura payload real y documenta en sección 17.3
}

function normalizeLinkedInSlug(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/in\//, '').replace(/\/$/, '').toLowerCase();
  } catch { return null; }
}
const slug = normalizeLinkedInSlug(linkedinRaw);

// Paso 3: Buscar pre-candidato por slug (case-insensitive) + campana + reclutador
const { data: precandidato } = slug
  ? await supabase
      .from('sp_precandidatos')
      .select('id, estado, cita_id, email, campana_id')
      .ilike('linkedin_url', `%/in/${slug}%`)
      .eq('campana_id', campanaId)
      .eq('reclutador_id', asesorAuthId)  // triple filtro: campaña + reclutador + linkedin_url
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  : { data: null };

// Crear la cita (siempre — cualquier booking del event type de SP se registra)
const attendee = payload.attendees?.[0];
const { data: cita } = await supabase
  .from('citas')
  .insert({
    agente_id: asesorAuthId,
    inicio: payload.startTime,
    fin: payload.endTime,
    meeting_url: payload.metadata?.videoCallUrl ?? null,
    // Cal Video y Google Meet envían la URL en payload.metadata.videoCallUrl
    // ⚠️ Verificar si citas.meeting_url tiene NOT NULL: si es así, usar '' en vez de null
    meeting_provider: 'calcom',
    external_event_id: bookingUid,
    estado: 'confirmada',
  })
  .select('id')
  .single();

if (precandidato) {
  // Cita de embudo: actualizar el pre-candidato existente
  await supabase
    .from('sp_precandidatos')
    .update({
      estado: 'cita_agendada',
      cita_id: cita.id,
      calcom_booking_uid: bookingUid,
      fecha_ultimo_evento: new Date().toISOString(),
      ...(precandidato.email ? {} : { email: attendee?.email ?? null }),
    })
    .eq('id', precandidato.id)
    .lt('paso_actual', 3); // no retroceder si ya estaba más avanzado
} else {
  // Event type de SP pero sin pre-candidato identificable
  // La cita queda registrada, el reclutador la verá en su calendario
}
```

### UI: selector de event type al crear campaña

Al crear una campaña en el CRM, se lista los event types del reclutador vía Cal.com API:

```
GET https://api.cal.com/v2/event-types
Authorization: Bearer {access_token}
```

El reclutador elige cuál de sus eventos corresponde a esta campaña. Se guarda en `sp_campana_reclutadores.calcom_event_type_id` (junto con la `calcom_scheduling_url`) al asignar el reclutador en la UI de la campaña.

### Disponibilidad del email por etapa del embudo

| Etapa | Evento SP | ¿Email disponible? |
|---|---|---|
| `connection.sent` | SP añade el contacto | Rara vez (solo si el perfil lo tiene público) |
| `connection.accepted` | La persona acepta | A veces |
| `message.received` | La persona responde | Solo si lo menciona en el mensaje |
| `BOOKING_CREATED` (Cal.com) | La persona agenda | **Siempre** — Cal.com siempre requiere email |

**Estrategia:** el email se enriquece progresivamente en cada webhook SP; se obtiene definitivamente en el webhook `BOOKING_CREATED` de Cal.com.

### Resolución de webhook_secret por reclutador en el endpoint compartido

Con Cal.com configurado **por reclutador** (OAuth individual + webhook registrado por cuenta), cada asesor tiene su propio `webhook_secret`. El endpoint `/api/webhooks/calcom` es único y compartido. La lógica de resolución es:

```
1. Recibir body raw + header x-cal-signature-256
2. Leer payload sin verificar → extraer payload.organizer.email
   (email está garantizado en la estructura Person de Cal.com webhooks)
   NOTA: payload.organizer.username NO está documentado en la estructura Person oficial
3. Buscar tokens_integracion WHERE meta->>'organizer_email' = email AND proveedor = 'calcom'
4. Obtener webhook_secret de meta->>'webhook_secret'
5. AHORA verificar HMAC con ese webhook_secret
6. Si la firma no coincide → rechazar con 401
```

> **Esto es seguro:** si alguien falsificara el `organizer.email` en el body, la firma HMAC no coincidiría con el webhook_secret del email falso. La verificación posterior garantiza integridad end-to-end.

### Manejo de `BOOKING_CANCELLED`

El evento `BOOKING_CANCELLED` llega con el mismo `uid` del booking original. La lógica es inversa al `BOOKING_CREATED`:

```typescript
// triggerEvent === 'BOOKING_CANCELLED'
// La verificación de firma y resolución de reclutador son idénticas al BOOKING_CREATED

const bookingUid: string = payload.uid ?? payload.bookingUid; // fallback por variante de versión

// Actualizar la cita en tabla citas
const { data: cita } = await supabase
  .from('citas')
  .update({ estado: 'cancelada' })
  .eq('external_event_id', bookingUid)
  .select('id')
  .single();

if (cita) {
  // Si hay un pre-candidato asociado, retroceder su estado
  await supabase
    .from('sp_precandidatos')
    .update({
      estado: 'link_enviado',  // regresa al estado anterior a la cita
      cita_id: null,
      calcom_booking_uid: null,
      fecha_ultimo_evento: new Date().toISOString(),
    })
    .eq('cita_id', cita.id);

  await supabase.from('sp_actividades').insert({
    precandidato_id: null, // se puede enriquecer joinándolo desde sp_precandidatos
    tipo: 'cita_cancelada',
    origen: 'calcom',
    metadata: { uid: bookingUid },
  });
}
```

> **Estado al cancelar:** se regresa a `link_enviado` (no a `en_secuencia`) — el candidato sí intentó agendar, SP puede enviar un follow-up automático si la secuencia lo contempla.

### Manejo de `BOOKING_RESCHEDULED`

El evento `BOOKING_RESCHEDULED` llega con el `uid` original y un nuevo `uid` (`rescheduledToUid`). La lógica actualiza la cita existente con los nuevos horarios:

```typescript
// triggerEvent === 'BOOKING_RESCHEDULED'
const oldUid: string = payload.uid ?? payload.bookingUid;
const newUid: string = payload.rescheduledToUid ?? oldUid;

// Actualizar la cita con los nuevos horarios
await supabase
  .from('citas')
  .update({
    inicio: payload.startTime,
    fin: payload.endTime,
    external_event_id: newUid,  // uid cambia al reprogramar
    estado: 'confirmada',
  })
  .eq('external_event_id', oldUid);

// Actualizar calcom_booking_uid en sp_precandidatos si cambió el uid
if (oldUid !== newUid) {
  await supabase
    .from('sp_precandidatos')
    .update({ calcom_booking_uid: newUid, fecha_ultimo_evento: new Date().toISOString() })
    .eq('calcom_booking_uid', oldUid);
}

await supabase.from('sp_actividades').insert({
  tipo: 'cita_reprogramada',
  origen: 'calcom',
  metadata: { old_uid: oldUid, new_uid: newUid, new_start: payload.startTime },
});
```

### Refresh de access token de Cal.com

Los access tokens de Cal.com **expiran en 30 minutos**. Todas las llamadas a la API de Cal.com (listar event types, registrar webhooks, cancelar citas) deben pasar por un helper que refresque el token si está próximo a vencer:

```typescript
// src/lib/integrations/calcom.ts
async function getValidCalcomToken(userId: string): Promise<string> {
  const token = await getToken(userId, 'calcom'); // lee de tokens_integracion
  if (isExpiredOrClose(token.expires_at, 60)) {   // margen de 60 segundos
    const refreshed = await refreshCalcomToken(token.refresh_token);
    await saveToken(userId, 'calcom', refreshed);  // persiste en BD
    return refreshed.access_token;
  }
  return token.access_token;
}
// 'expires_at' debe guardarse al hacer OAuth y al cada refresh
// tokens_integracion ya tiene refresh_token en meta; agregar 'expires_at' al meta jsonb
```

> Los webhooks **no necesitan** access_token para funcionar — solo usan `webhook_secret` para verificar firma. El refresh solo aplica para llamadas activas (listar event types, cancelar citas desde CRM).

---

## 12. Flujo de Promoción: Pre-candidato → Candidato

```
[CRM: Perfil pre-candidato]
         │
         │  Reclutador hace clic en "Promover a Candidato"
         ▼
[Formulario pre-llenado de nuevo candidato]
  - nombre ← sp_precandidatos.nombre
  - email  ← sp_precandidatos.email
  - empresa ← sp_precandidatos.empresa
  - cargo  ← sp_precandidatos.cargo
         │
         │  Reclutador completa y guarda
         ▼
[POST /api/precandidatos/{id}/promover]
  1. INSERT INTO candidatos (...) → id_candidato
  2. UPDATE sp_precandidatos
       SET candidato_id = id_candidato,
           estado = 'promovido',
           fecha_promocion = now()
  3. INSERT INTO sp_actividades
       (tipo = 'promovido_a_candidato', ...)
  4. Redirigir al perfil del nuevo candidato
```

---

## 13. Métricas Disponibles

| Métrica | Base de consulta |
|---|---|
| Pre-candidatos por campaña | `COUNT(*) GROUP BY campana_id` |
| Tasa de respuesta | `respondio / en_secuencia` |
| Tasa de conversión a cita | `cita_agendada / link_enviado` |
| Tasa de promoción final | `promovido / cita_agendada` |
| Tiempo promedio de respuesta | `fecha_respuesta - fecha_primer_mensaje` |
| Embudo por estado | `COUNT(*) GROUP BY estado` |
| Desempeño por reclutador | `GROUP BY sp_campana_reclutadores.reclutador_id` |
| Actividad por campaña | `sp_actividades JOIN sp_precandidatos ON campana_id` |

---

## 14. Orden de Implementación Recomendado

### Fase 1 — Infraestructura base
1. **Migración Supabase** — Crear `sp_campanas`, `sp_campana_reclutadores`, `sp_precandidatos`, `sp_actividades`
2. **`src/lib/integrations/sendpilot.ts`** — Cliente API bidireccional (métodos de salida + verificador de firma)
3. **Guardar API key de SendPilot** — `POST /api/integraciones/sendpilot` → `tokens_integracion`

### Fase 2 — Webhooks entrantes
4. **`/api/webhooks/sendpilot`** — Verificación `Webhook-Signature: v1,t=...,s=...` + idempotencia por `eventId` + escritura en `sp_precandidatos` y `sp_actividades`
5. **Cal.com OAuth** — Agregar proveedor a `oauth.ts`; crear `/api/integraciones/calcom/callback/route.ts`; llamar `GET /v2/me` (header `cal-api-version: 2024-06-14`) para obtener `email` y `username`; registrar webhook `POST /v2/webhooks` con body `{ secret, triggers: ["BOOKING_CREATED","BOOKING_CANCELLED","BOOKING_RESCHEDULED"] }`; guardar `organizer_email`, `username`, `webhook_id`, `webhook_secret`, `expires_at` en `meta jsonb` de `tokens_integracion`; UI para seleccionar event type predeterminado
6. **`/api/webhooks/calcom`** — Resolución de `webhook_secret` por `organizer.email` del payload → verificación `x-cal-signature-256` (HMAC-SHA256 del raw body) → manejar `BOOKING_CREATED`, `BOOKING_CANCELLED` y `BOOKING_RESCHEDULED`. Para CREATED: tres cascadas (embudo SP, prefill orgánico, personal). Para CANCELLED: revertir estado. Para RESCHEDULED: actualizar horario en citas.
7. **`/api/cal/[campaignSlug]/[contactId]`** — Redirect endpoint de SP: busca campaña por `slug` → lee `reclutador_id` del pre-candidato → busca `sp_campana_reclutadores` para obtener `calcom_scheduling_url` → 302 con prefill de `linkedin_url` + registra click en `sp_actividades` (ver sección 11-B)

### Fase 3 — API bidireccional SendPilot
8. **`/api/sendpilot/campaigns`** — GET (listar) + PATCH (pause/resume)
9. **`/api/sendpilot/leads`** — POST (añadir lead a campaña desde CRM)
10. **`/api/sendpilot/leads/[id]`** — PUT (actualizar estado)
11. **`/api/sendpilot/inbox`** — GET inbox + POST reply

### Fase 4 — UI
11. **Pre-candidatos** — Embudo + detalle + botón promover + botón "Añadir a campaña SP"
12. **Dashboard campañas SP** — Métricas + controles pause/resume desde CRM
13. **Inbox centralizado** — Vista de mensajes LinkedIn con respuesta desde CRM

### Fase 5 — Reportes
14. **Métricas/reportes** — Dashboard de embudo completo, tasas de conversión, desempeño por reclutador

---

## 11-B. Reclutadores por Campaña y Link de Cal.com en SP

### Múltiples reclutadores por campaña

Una campaña de SP puede tener 1 o más reclutadores asignados, cada uno con su propia URL y event type de Cal.com. La asignación se gestiona en `sp_campana_reclutadores`.

**Flujo de resolución (por pre-candidato):**
```
sp_precandidatos.campana_id  →  sp_campanas (slug, calcom_linkedin_identifier)
sp_precandidatos.reclutador_id  →  auth.users(id)
         │
         ▼
tokens_integracion WHERE proveedor = 'calcom' AND usuario_id = reclutador_id
  WHERE usuario (via id_auth = reclutador_id)
    AND proveedor = 'calcom'
         │
         ├── meta->>'organizer_email'          (clave de resolución en webhook)
         ├── meta->>'username'                  (referencia)
         └── meta->>'webhook_secret'            (para verificar webhooks entrantes)

sp_campana_reclutadores (JOIN por campana_id + reclutador_id)
         ├── calcom_event_type_id               (filtra bookings de esta campaña)
         └── calcom_scheduling_url              (URL de agendamiento directa)
```

El webhook de `connection.sent` de SP crea el `sp_precandidato` con `campana_id`. El CRM asigna entonces un `reclutador_id` por round-robin entre los reclutadores activos en `sp_campana_reclutadores` para esa campaña. Las citas creadas desde Cal.com se asignan automáticamente al `agente_id` del reclutador.

**En la UI de Campaña SP**, se configura la lista de reclutadores activos para esa campaña — cada uno con su `calcom_scheduling_url` y `calcom_event_type_id`:

| Campo | Descripción |
|---|---|
| Reclutador | Dropdown de usuarios que tengan Cal.com conectado |
| URL de Cal.com | `https://cal.com/{username}/{event-slug}` del reclutador |
| Event Type ID | Valor numérico de `GET /v2/event-types` del reclutador |
| Activo | Toggle para habilitar/deshabilitar sin borrar los datos |

> Un mismo reclutador puede pertenecer a múltiples campañas, cada una con distinto event type.

---

### Link personalizado de Cal.com en la secuencia de SP

**El problema:** distintos reclutadores tienen distintos links de Cal.com, y la `linkedin_url` de cada prospecto es única. La secuencia de SP es una plantilla única por campaña — no puede hardcodear ni el link del reclutador ni el perfil de cada prospecto.

**La solución: endpoint de redirección en el CRM.**

El template de la secuencia de SP usa siempre la misma URL estructura:
```
https://crm.lealtia.mx/api/cal/{campaignSlug}/{sp_contact_id}
```

Esta URL es fija para toda la campaña (se configura una vez en SP). El CRM resuelve dinámicamente el destino final:

```typescript
// GET /api/cal/[campaignSlug]/[contactId]
export async function GET(
  _req: Request,
  { params }: { params: { campaignSlug: string; contactId: string } }
) {
  const { campaignSlug, contactId } = params;

  // 1. Campaña → id y calcom_linkedin_identifier (por slug)
  const { data: campana } = await supabase
    .from('sp_campanas')
    .select('id, calcom_linkedin_identifier')
    .eq('slug', campaignSlug)
    .single();

  if (!campana) {
    return new Response('Campaign not found', { status: 404 });
  }

  // 2. Pre-candidato → reclutador asignado + linkedin_url
  const { data: precandidato } = await supabase
    .from('sp_precandidatos')
    .select('id, linkedin_url, reclutador_id')
    .eq('sendpilot_contact_id', contactId)
    .eq('campana_id', campana.id)
    .single();

  if (!precandidato?.reclutador_id) {
    // Precandidato sin reclutador asignado aún (race condition) — intentar asignar
    return new Response('Recruiter not assigned yet', { status: 503 });
  }

  // 3. Obtener calcom_scheduling_url del reclutador en esta campaña
  const { data: asignacion } = await supabase
    .from('sp_campana_reclutadores')
    .select('calcom_scheduling_url')
    .eq('campana_id', campana.id)
    .eq('reclutador_id', precandidato.reclutador_id)
    .eq('activo', true)
    .single();

  if (!asignacion?.calcom_scheduling_url) {
    return new Response('Recruiter not configured for this campaign', { status: 404 });
  }

  // 4. Registrar el click (métrica: "link click antes de agendar")
  await supabase.from('sp_actividades').insert({
    precandidato_id: precandidato.id,
    tipo: 'calcom_link_click',
    origen: 'calcom',
    created_at: new Date().toISOString(),
  });

  // 5. Construir URL final con prefill de linkedin_url
  const dest = new URL(asignacion.calcom_scheduling_url);
  const identifier = campana.calcom_linkedin_identifier ?? 'LinkedIn';
  if (precandidato.linkedin_url) {
    dest.searchParams.set(identifier, precandidato.linkedin_url);
    // identifier viene de sp_campanas.calcom_linkedin_identifier (default: 'LinkedIn', L mayúscula)
    // Activar "Disable input if the URL identifier is prefilled" en Cal.com para bloquear el campo
  }

  return Response.redirect(dest.toString(), 302);
}
```

**Template en la secuencia de SP** (se configura una vez por campaña):
```
¿Te gustaría tener una llamada de 30 min?

Agenda aquí: https://crm.lealtia.mx/api/cal/{{CAMPAIGN_SLUG}}/{{contact.id}}
```
> `{{CAMPAIGN_SLUG}}` se sustituye por el slug legible de la campaña (ej. `paola-2026q1`) al configurar la secuencia.  
> `{{contact.id}}` es el merge tag de SP para el ID del contacto en esa campaña.

**Ventajas del enfoque redirect:**

| Característica | Redirect CRM | Link directo en SP |
|---|---|---|
| Distintos reclutadores por campaña | ✅ Automático | ❌ Requiere configurar por campaña |
| `linkedin_url` personalizada por prospecto | ✅ Siempre | ⚠️ Solo si SP soporta URL-encoding en merge tags |
| Reclutador cambia → sin editar SP | ✅ Solo cambiar en CRM | ❌ Hay que actualizar la secuencia |
| Tracking de clicks | ✅ `sp_actividades` | ❌ No disponible |
| Dependencia del motor de templates de SP | ✅ Ninguna | ⚠️ SP debe URL-encodear el merge tag |

---

## 15. Decisiones Confirmadas

> Todas las decisiones de negocio han sido resueltas. Se puede comenzar la implementación.

| # | Decisión | Resolución |
|---|---|---|
| 1 | ¿Cal.com es por reclutador o cuenta empresarial? | ✅ **Por reclutador** — OAuth individual por asesor, webhook registrado por cuenta en Cal.com, `tokens_integracion` con `usuario_id`. Cada asesor conecta su propia cuenta desde Configuración. |
| 2 | ¿SendPilot ya está contratado? | ✅ **Sí, ya contratado** — Solo se necesita la API Key y definir el Webhook Secret. |

> **Implicación técnica de Cal.com por reclutador:** La tabla `tokens_integracion` almacena un registro por `usuario_id` con el `access_token`, `refresh_token`, `username` y `webhook_secret` de cada asesor. El webhook de Cal.com se registra vía `POST /v2/webhooks` con el `access_token` del reclutador al completar el OAuth. Las citas creadas via Cal.com se asignan automáticamente al asesor dueño del token.

---

## 16. Propuesta de Valor para el Cliente (No Técnica)

| Antes | Después |
|---|---|
| Búsqueda manual de candidatos en LinkedIn | SendPilot busca automáticamente por perfil ideal |
| Mensajes escritos uno por uno | Secuencia automática personalizada |
| Candidato agenda por WhatsApp o email | Link de Cal.com en la secuencia — agenda solo 24/7 |
| La cita debe registrarse manualmente en el CRM | Cal.com sincroniza automáticamente con el calendario del CRM |
| Reclutador revisa SendPilot, Cal.com y LinkedIn por separado | Todo visible y operable desde el CRM |
| Para pausar una campaña hay que abrir SendPilot | Un botón en el CRM pausa/reanuda la campaña |
| Los mensajes de LinkedIn están dispersos en SP | Inbox centralizado en el CRM con opción de responder |
| Proceso de selección sin datos | Métricas de todo el embudo en tiempo real |
| Decisión de avanzar sin contexto | Perfil completo + historial de actividades antes de la llamada |

---

## 17. Riesgos de Implementación y Mitigaciones

### 17.1 Cal.com — OAuth en plan gratuito requiere aprobación manual ⚠️

**Hallazgo:** Cal.com sí muestra OAuth clients en el plan gratuito (`app.cal.com/settings/developer/oauth`), pero según la documentación oficial:

> "The OAuth client will be in a **pending** state and not yet ready to use. An admin from Cal.com will then review your OAuth client and you will receive an email if it was accepted or rejected."

Esto significa que el CRM no puede usar OAuth de Cal.com inmediatamente — requiere que el equipo de Cal.com apruebe la app manualmente. El tiempo de aprobación no está documentado y puede tomar días o ser rechazado sin motivo claro.

**Mientras no haya aprobación OAuth:** usar la Opción A (API key por reclutador). Una vez aprobado el OAuth client, migrar al flujo OAuth estándar.

**Cal.com es una cuenta por persona.** Cada reclutador tiene su propio `cal.com/su-username`. El webhook de cada reclutador se registra en su propia cuenta.

**Flujo de conexión con API key (mientras OAuth está pendiente):**

**Setup único por el admin del CRM (una sola vez):**
1. `app.cal.com` → Settings → Developer → OAuth → New → registrar la app del CRM → **esperar aprobación**
2. Mientras tanto: usar API key como mecanismo de conexión

**Lo que hace el reclutador con API key:**
1. `app.cal.com` → Settings → Developer → API Keys → New → copiar
2. Pegar en CRM → Configuración → Integraciones → Cal.com → "Conectar"

**Flujo OAuth (una vez aprobado):**
1. CRM → Configuración → Integraciones → Cal.com → clic "Conectar con Cal.com"
2. Flujo OAuth estándar: redirect a Cal.com → autoriza → regresa al CRM
3. Obtener `client_id` y `client_secret` → configurar en variables de entorno del CRM

**Lo que hace cada reclutador:**
1. CRM → Configuración → Integraciones → Cal.com → clic "Conectar con Cal.com"
2. Flujo OAuth estándar: redirect a Cal.com → autoriza → regresa al CRM

**Lo que hace el CRM automáticamente tras el OAuth:**
1. Recibe `access_token` + `refresh_token`
2. `GET https://api.cal.com/v2/me` → obtiene `username`
3. Genera `webhook_secret` aleatorio
4. `POST https://api.cal.com/v2/webhooks` → registra webhook en la cuenta del reclutador apuntando a `/api/webhooks/calcom`
5. Guarda en `tokens_integracion`: `access_token`, `refresh_token`, `username`, `webhook_secret`

```
Reclutador hace clic "Conectar" en CRM
  └─ OAuth → Cal.com autoriza → CRM recibe access_token
       └─ CRM registra webhook en cuenta del reclutador
            └─ Cal.com envía BOOKING_CREATED → /api/webhooks/calcom
                 └─ handler verifica firma con webhook_secret almacenado
                 └─ organizer.email → asocia al reclutador correcto
```

**Implicación en `tokens_integracion`:**

```sql
-- proveedor = 'calcom'
-- usuario_id   = uuid del reclutador en el CRM
-- token_encriptado = access_token de Cal.com
-- refresh_token    = para renovar access_token
-- webhook_secret   = secret generado al registrar el webhook (se usa para verificar x-cal-signature-256)
-- expires_at       = timestamp ISO de cuando vence el access_token (para saber cuándo refrescar)
-- metadata         = { "organizer_email": "paola@lealtia.mx", "username": "paola-pecina", "webhook_id": 123 }
```

> **Ventaja sobre API key:** si el reclutador revoca el acceso desde Cal.com, el CRM puede detectarlo en el siguiente refresh y mostrar el estado "desconectado" en el perfil del asesor, igual que con Google/Zoom.

---

### 17.2 `CAMPAIGN_ID` hardcodeado en la secuencia de SP

**Problema:** El UUID de la campaña del CRM debe estar pegado manualmente en el mensaje de la secuencia de SP. Al crear una nueva campaña en el CRM, el reclutador debe abrir SP y editar el texto del mensaje con el nuevo UUID — fricción operativa permanente y fuente de errores.

**Mitigación: slug legible en `sp_campanas`**

Agregar campo `slug text UNIQUE` en `sp_campanas`. El redirect endpoint expone:
```
/api/cal/[slug]/[contactId]
```
en vez de `/api/cal/[uuid]/[contactId]`.

Ventajas:
- El reclutador configura en SP una URL como `https://crm.lealtia.mx/api/cal/paola-2026q1/{{contact.id}}` — legible y verificable a simple vista
- Si se migra el UUID interno, la URL de SP no cambia

**UI del CRM:** Al crear la campaña, el CRM sugiere un slug automático (ej. `nombre-del-segmento-mes-año`) y muestra el link listo para pegar en SP.

```sql
ALTER TABLE sp_campanas ADD COLUMN slug text UNIQUE;
```

---

### 17.3 Shape del payload `BOOKING_CREATED` no validado

**Problema:** Cal.com puede enviar las respuestas de booking questions en estructuras distintas según la versión de la API (`responses` como objeto con keys = identifiers, o como array). Si el handler asume la estructura incorrecta, el matching por `linkedin_url` falla silenciosamente — la cita se crea en el CRM pero el `sp_precandidato` nunca se actualiza a `cita_agendada`.

**Mitigación: validar con booking real antes de implementar el handler**

1. Hacer un booking de prueba en `https://cal.com/paola-pecina/30min` con LinkedIn URL real
2. Capturar el payload completo que llega al webhook (usar `console.log` o un inspeccionador como webhook.site)
3. Documentar el shape exacto aquí antes de escribir el parser

**Mitigación en código: parser defensivo con fallback**

```typescript
function extractLinkedinUrl(payload: CalcomBookingPayload): string | null {
  const responses = payload.responses ?? payload.booking?.responses;
  if (!responses) return null;

  // Shape A: objeto con keys = identifiers (esperado en Cal.com v2)
  if (typeof responses === 'object' && !Array.isArray(responses)) {
    return responses['LinkedIn']?.value ?? null;
  }

  // Shape B: array (versión legacy o planes distintos)
  if (Array.isArray(responses)) {
    const field = responses.find(
      (r: { identifier?: string; label?: string }) =>
        r.identifier === 'LinkedIn' || r.label === 'LikedIn URL'
    );
    return field?.value ?? null;
  }

  return null;
}
```

> **Acción requerida antes de Fase 3:** capturar un payload real de Cal.com y confirmar el shape.

---

### 17.4 Identifier de LinkedIn en Cal.com es configurable por el reclutador — no se puede hardcodear

**Problema:** El identifier de la pregunta "LinkedIn URL" en Cal.com lo define el propio reclutador al crear o editar su evento (Advanced → Booking Questions → Edit → campo Identifier). En el caso de Paola es `LinkedIn`, pero otro reclutador podría haberlo llamado `linkedin_url`, `perfil`, `linkedIn`, etc. El prefill `?{identifier}=` y el parser del webhook dependen de este valor exacto.

**Si el CRM lo tiene hardcodeado a `LinkedIn`:** fallará silenciosamente para cualquier reclutador que use un identifier diferente.

**Mitigación: almacenar el identifier por campaña en `sp_campanas`**

Agregar campo `calcom_linkedin_identifier text` en `sp_campanas`. Al configurar una campaña, el reclutador informa cuál es el identifier de su pregunta de LinkedIn.

```sql
ALTER TABLE sp_campanas ADD COLUMN calcom_linkedin_identifier text DEFAULT 'LinkedIn';
```

El redirect endpoint y el webhook handler leen este campo en lugar de usar un valor fijo:

```typescript
// En el redirect endpoint:
dest.searchParams.set(campana.calcom_linkedin_identifier, precandidato.linkedin_url);

// En el webhook handler:
function extractLinkedinUrl(responses: unknown, identifier: string): string | null {
  // usa campana.calcom_linkedin_identifier en lugar de 'LinkedIn' hardcodeado
}
```

**UI del CRM:** Al configurar la campaña, mostrar instrucción y campo editable:

> Identifier del campo LinkedIn en Cal.com: `[LinkedIn]` — debe coincidir exactamente con el valor configurado en tu evento (Advanced → Booking Questions → Edit → Identifier). Es case-sensitive.

**Identifier confirmado para Paola Pecina (`paola-pecina`):** `LinkedIn` ✅  
**Activar** "Disable input if the URL identifier is prefilled" en Cal.com para que el candidato no pueda modificar el campo prefillado.

---

### 17.5 Webhooks de SP pueden llegar fuera de orden

**Problema:** SendPilot no garantiza orden de entrega. `sequence.step.sent` podría llegar antes de `contact.added`. Si el handler intenta actualizar `sp_precandidatos.estado` de forma secuencial, puede terminar con un estado incorrecto.

**Mitigación: estado no retrocede nunca**

```typescript
// Nunca hacer UPDATE sin WHERE en estado
await supabase
  .from('sp_precandidatos')
  .update({ estado: nuevoEstado, paso_actual: nuevoPaso })
  .eq('id', precandidatoId)
  .lt('paso_actual', nuevoPaso); // solo avanza, nunca retrocede
```

**Mitigación: todas las actividades son append-only**

`sp_actividades` registra cada evento como insert — nunca update. El estado visible en UI se puede recalcular desde las actividades si hace falta auditoría.

---

### 17.6 LinkedIn puede transformar URLs en mensajes de SP

**Problema:** LinkedIn a veces convierte los links en mensajes a sus propios tracking URLs (`lnkd.in/...`). Esto puede hacer que el redirect del CRM reciba la URL transformada o que el link se rompa.

**Mitigación: probar con cuenta real de SP + LinkedIn antes de Fase 3**

Enviar un mensaje de prueba en SP con el link `/api/cal/...` y verificar que el destinatario recibe el link funcional. Si LinkedIn transforma la URL, evaluar:
- Usar un dominio propio con redirect (ya es el caso: `crm.lealtia.mx`)
- Acortar la URL con un servicio que preserve el redirect (no recomendado por dependencia externa)

> El redirect propio del CRM (`crm.lealtia.mx/api/cal/...`) ya es la mejor mitigación posible — es un dominio conocido y no un UUID largo que pueda verse sospechoso.

---

### Resumen de riesgos por prioridad

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| 1 | Cal.com OAuth requiere aprobación manual de Cal.com (estado pending) | Alto | API key como fallback mientras se espera aprobación; migrar a OAuth cuando esté aprobado |
| 2 | `CAMPAIGN_ID` UUID en SP → error humano al configurar | Alto (operativo) | Campo `slug` en `sp_campanas` + UI que genera el link listo |
| 3 | Shape de `responses` en webhook no validado | Alto (silencioso) | Capturar payload real antes de implementar; parser con doble fallback |
| 4 | Identifier LinkedIn variable por reclutador — no se puede hardcodear | Medio–Alto | Campo `calcom_linkedin_identifier` en `sp_campanas`; UI editable con valor por defecto `LinkedIn` |
| 5 | Webhooks SP fuera de orden | Medio | `UPDATE ... WHERE paso_actual < nuevoPaso`; actividades append-only |
| 6 | LinkedIn transforma URLs en mensajes | Bajo–Medio | Probar con SP+LinkedIn real; redirect desde dominio propio ya mitiga |
