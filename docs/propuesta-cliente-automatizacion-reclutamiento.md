# Propuesta de Automatización de Reclutamiento
### Lealtia — Gestión de Candidatos

> **Fecha:** Abril 2026  
> **Para:** Cliente  
> **Elaborado por:** Equipo Lealtia

---

## El problema actual

El proceso de reclutamiento hoy en día requiere que el equipo:

- Busque manualmente perfiles en LinkedIn
- Envíe mensajes uno a uno y haga seguimiento manual
- Copie y pegue datos de contacto entre LinkedIn, correo y el CRM
- Coordine citas por separado y las registre a mano en el sistema
- No tenga visibilidad en tiempo real de cuántos candidatos van avanzando y en qué etapa están

Esto genera pérdida de tiempo, errores de registro y candidatos que se "pierden" en el proceso.

---

## La solución propuesta

Conectar tres herramientas que ya existen en el mercado — **SendPilot**, **Cal.com** y el **CRM de Lealtia** — para que trabajen juntas de forma automática, sin intervención manual en el flujo rutinario.

---

## ¿Cómo funciona el nuevo flujo?

```
1. BUSCAR          →   2. CONTACTAR       →   3. AGENDAR
LinkedIn (ICP)         Secuencia automática    Link de Cal.com
vía SendPilot          de mensajes             en el mensaje


4. REGISTRAR       →   5. ENTREVISTAR     →   6. PROMOVER
Cita aparece en        El reclutador           Botón en el CRM:
el CRM automáti-       realiza la llamada      Pre-candidato →
camente                y toma notas            Candidato oficial
```

### Paso a paso (sin tecnicismos)

**1. Búsqueda de perfiles (SendPilot + LinkedIn)**  
El reclutador define el perfil ideal (cargo, sector, ubicación). SendPilot busca automáticamente en LinkedIn y añade los contactos a una campaña.

**2. Contacto automatizado**  
SendPilot envía una secuencia de mensajes en LinkedIn con el tono y contenido que defina el equipo. En uno de los mensajes incluye el link directo para agendar una llamada.

**3. La persona agenda su cita**  
El candidato potencial hace clic en el link de Cal.com y elige el horario que le convenga, sin que el reclutador tenga que intervenir.

**4. El CRM se actualiza solo**  
En cuanto la cita es agendada, aparece automáticamente en el calendario del CRM y se crea el perfil del pre-candidato. El reclutador recibe una notificación.

**5. Entrevista y seguimiento**  
El reclutador realiza la llamada y puede registrar notas directamente en el perfil del CRM.

**6. Promoción a candidato**  
Con un solo clic, el pre-candidato se convierte en candidato oficial dentro del sistema, con todos sus datos ya pre-llenados.

---

## Antes vs. Después

| Actividad | Antes | Después |
|---|---|---|
| Buscar perfiles en LinkedIn | Manual, perfil por perfil | Automático vía SendPilot |
| Enviar mensajes de contacto | Manual, uno por uno | Secuencia automática programada |
| Agendar entrevista | Coordinar por mensajes o email | El candidato agenda solo con Cal.com |
| Registrar cita en el CRM | Copia y pega manual | Se registra automáticamente al agendar |
| Ver estado de los candidatos | Sin visibilidad centralizada | Panel en tiempo real en el CRM |
| Pasar de pre-candidato a candidato | Datos duplicados a mano | Un clic — datos pre-llenados |
| Gestionar campañas de mensajes | Sólo desde SendPilot | También desde el CRM |

---

## ¿Qué verá el reclutador en el CRM?

Una nueva sección con tres vistas principales:

### 1. Panel de Pre-candidatos
Vista de embudo con el total de personas en cada etapa:

```
En secuencia (50) → Respondieron (20) → Cita agendada (8) → Promovidos (3)
```

### 2. Panel de Campañas SendPilot
Resumen de campañas activas: cuántos mensajes enviados, respuestas recibidas, citas generadas.  
Posibilidad de **pausar o reactivar** una campaña directamente desde el CRM, sin abrir SendPilot.

### 3. Inbox centralizado
Los mensajes de LinkedIn recibidos en SendPilot se pueden leer y responder **desde el CRM**, sin cambiar de plataforma.

---

## ¿Qué herramientas se conectan?

| Herramienta | Rol | ¿Requiere contrato nuevo? |
|---|---|---|
| **SendPilot** | Búsqueda en LinkedIn + mensajes automatizados | Ya contratado / Pendiente contratar |
| **Cal.com** | Agendamiento de citas sin coordinación manual | **Plan gratuito** — incluye webhooks, API y tipos de evento ilimitados |
| **CRM Lealtia** | Panel central de visibilidad y control | Ya en uso — se actualiza con nuevas secciones |

> **¿Por qué Cal.com y no Calendly?** Calendly requiere plan de pago (~$10/mes por reclutador) para acceder a webhooks y API. Cal.com ofrece las mismas funcionalidades en su plan gratuito.

> **LinkedIn** no requiere ninguna integración adicional — SendPilot se conecta a LinkedIn de forma nativa.

---

## Resumen del valor para el negocio

> **Menos tiempo operativo.** El equipo deja de hacer tareas repetitivas y se enfoca en lo que genera valor: las entrevistas y la selección.

> **Más candidatos procesados.** La automatización permite escalar el volumen de contactos sin aumentar el equipo.

> **Visibilidad total del proceso.** El CRM muestra en todo momento cuántos candidatos hay en cada etapa, sin depender de hojas de cálculo o memoria individual.

> **Menos errores de registro.** Los datos viajan automáticamente entre sistemas, eliminando la copia manual.

---

## Plan de implementación

| Fase | ¿Qué se hace? | Duración estimada |
|---|---|---|
| **Fase 1** | Base de datos + estructura interna | 3–4 días |
| **Fase 2** | Recepción de eventos de SendPilot → CRM | 3–4 días |
| **Fase 3** | Conexión con Cal.com → citas automáticas | 3–4 días |
| **Fase 4** | Panel bidireccional (CRM controla SendPilot) | 4–5 días |
| **Fase 5** | UI: pre-candidatos, campañas, inbox | 4–5 días |

**Total estimado: 3–4 semanas de desarrollo** (más tiempo de pruebas y ajustes con datos reales).

---

## Decisiones confirmadas

| Decisión | Respuesta |
|---|---|
| ¿Cal.com es por reclutador o cuenta empresa? | ✅ **Por reclutador** — cada uno conecta su propia cuenta con un clic desde su perfil en el CRM |
| ¿SendPilot ya está contratado? | ✅ **Sí** — solo se necesita compartir la API Key con el equipo de desarrollo |

---

## Próximos pasos

1. ✅ ~~Confirmar la decisión de Cal.com~~ — **Por reclutador, plan gratuito**
2. ✅ ~~Verificar si SendPilot ya está contratado~~ — **Sí, ya contratado**
3. Compartir la API Key de SendPilot con el equipo de desarrollo
4. Validar acceso al entorno del CRM para iniciar desarrollo
5. Aprobar esta propuesta para comenzar la Fase 1

---

*Documento preparado por el equipo de desarrollo de Lealtia. Para más detalles técnicos, consultar el documento interno `automatizacion-sendpilot-calendly-linkedin-crm.md`.*
