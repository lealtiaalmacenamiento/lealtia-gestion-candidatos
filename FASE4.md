# Fase 4 – Sistema de Agendado Interno

## Resumen
Implementación de un sistema de agendado de citas virtuales exclusivo para usuarios registrados en la plataforma. Permite agendar citas con agentes, seleccionar acompañantes desarrolladores (supervisores) o agendar sin acompañante, generando automáticamente enlaces de videollamada y enviando notificaciones por correo.

## Alcance

1. **Agendado interno**
   - Solo usuarios registrados pueden agendar citas.
   - Acceso al módulo de agendado desde el sistema.

2. **Selección de acompañante**
   - El usuario puede elegir un desarrollador disponible para acompañar al agente en la cita.
   - Si no se selecciona acompañante, la cita se agenda solo con el agente.

3. **Notificación a superusuarios**
   - Si la cita se agenda sin acompañante, los superusuarios reciben copia oculta del correo de confirmación.

4. **Disponibilidad real**
   - Solo se muestran horarios donde el agente y el acompañante (si aplica) están libres.

5. **Videollamada automática**
   - El sistema genera el enlace de videollamada (Google Meet, Zoom o Teams) y lo incluye en el correo de confirmación.

6. **Confirmaciones y recordatorios**
   - Correos automáticos con detalles y recordatorios antes de la cita para todos los participantes.

7. **Cancelación de citas**
   - Permite cancelar citas, libera el horario y envía notificaciones de cancelación.

8. **Panel de parámetros**
   - Permite marcar qué superusuarios son “desarrolladores” y pueden acompañar a los agentes.

## Flujos funcionales

- **Agendar con acompañante:**  
  El usuario selecciona un desarrollador disponible; todos reciben el enlace y confirmación por correo.

- **Agendar sin acompañante:**  
  El usuario agenda solo; él y el agente reciben el correo, los superusuarios reciben copia oculta.

- **Sin desarrolladores disponibles:**  
  El usuario puede agendar solo y los superusuarios serán notificados.

- **Cancelación:**  
  Todos los involucrados reciben correo de cancelación y el horario queda libre.

## Beneficios

- Flexibilidad para usuarios/agentes.
- Supervisión garantizada para citas sin acompañante.
- Experiencia profesional y ágil.
- Reducción de citas fallidas gracias a recordatorios automáticos.

## Entregables de la Fase 4

- Módulo de agendado interno.
- Panel de parámetros para desarrolladores.
- Integración con videollamadas.
- Sistema de notificaciones por correo.
- Cancelación y gestión de citas.
