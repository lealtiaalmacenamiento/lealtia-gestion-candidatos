# Cuestionarios, simulación PPR y Cal.com

## Alcance implementado

- El código de agente se captura y modifica manualmente desde Candidatos. Los códigos existentes se conservan mientras el usuario no los cambie.
- Supervisores y administradores configuran cuestionarios desde Parámetros.
- Agentes y supervisores generan enlaces personalizados desde el módulo Cuestionarios del inicio.
- Un supervisor puede seleccionar al agente responsable. El enlace conserva de forma segura el agente, su código y el evento de Cal.com.
- El prospecto completa el cuestionario, consulta su simulación PPR y reserva una sesión sin iniciar sesión en el CRM.
- La sesión usa la ubicación configurada en el evento de Cal.com: Cal Video, Google Meet, Zoom u otra disponible.
- Agenda interna puede crear, cancelar y reprogramar sesiones de Cal.com.
- Planificación recibe los bloques sincronizados y continúa mostrando la semana del agente; no crea citas.
- Los webhooks mantienen sincronizadas las reservas, cancelaciones y reprogramaciones.

## Preparación de `develop`

1. Aplicar `supabase/migrations/20260705000000_questionnaire_ppr_flow.sql` en la base de datos de desarrollo.
2. Crear un cliente OAuth en `https://app.cal.com/settings/developer/oauth` y habilitar los permisos:

   `EVENT_TYPE_READ BOOKING_READ BOOKING_WRITE SCHEDULE_READ PROFILE_READ WEBHOOK_READ WEBHOOK_WRITE`

3. Registrar como Redirect URI:

   `https://dominio-de-desarrollo/api/integraciones/calcom/callback`

4. Configurar `CALCOM_CLIENT_ID`, `CALCOM_CLIENT_SECRET` y `CALCOM_REDIRECT_URI`.
5. Configurar `NEXT_PUBLIC_APP_URL` con la URL pública de desarrollo o definir `CALCOM_WEBHOOK_URL` con:

   `https://dominio-de-desarrollo/api/webhooks/calcom`

6. Cada agente conecta su cuenta desde Integraciones > Cal.com mediante el botón OAuth.
7. Cada agente selecciona su evento predeterminado.
8. Es recomendable que el agente conecte Google Calendar dentro de Cal.com. Así Cal.com respeta sus eventos ocupados sin mostrar detalles privados en el CRM.
9. Registrar o confirmar el código manual del agente en Candidatos.

## Recorrido de aceptación

1. Crear o editar un cuestionario como supervisor.
2. Generar un enlace para un agente que tenga código y Cal.com conectado.
3. Abrir el enlace en una ventana privada.
4. Completar el cuestionario y la simulación PPR.
5. Elegir un horario y confirmar la reserva.
6. Verificar la cita en Agenda interna y el bloque correspondiente en Planificación.
7. Reprogramar y cancelar desde Agenda interna, verificando el mismo cambio en Cal.com y Planificación.

## Consideraciones

- El CRM guarda únicamente las citas comerciales creadas mediante el flujo; los eventos privados permanecen en Google Calendar/Cal.com.
- Las aperturas, respuestas y citas se muestran por enlace en el módulo Cuestionarios.
- Las preguntas del cuestionario se pueden ajustar desde Parámetros sin modificar código.
- La migración debe aplicarse antes de publicar esta versión; el código no intenta crear las tablas automáticamente.
