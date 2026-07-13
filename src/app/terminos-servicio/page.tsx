import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terminos de Servicio | Lealtia Portal de Asesores',
  description:
    'Consulta los terminos aplicables al uso del Portal de Asesores Lealtia y sus integraciones autorizadas.'
}

const sections: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: '1. Objeto del portal',
    paragraphs: [
      'El Portal de Asesores Lealtia es una herramienta de uso autorizado para asesores, supervisores, administradores y equipo operativo de Lealtia.',
      'El portal permite gestionar prospectos, candidatos, citas, seguimiento comercial, reportes operativos e integraciones con servicios externos cuando el usuario o la organizacion lo autorizan.'
    ]
  },
  {
    title: '2. Uso autorizado',
    paragraphs: [
      'El acceso al portal esta limitado a usuarios autorizados por Lealtia o por la organizacion responsable de la operacion.',
      'Cada usuario es responsable de mantener la confidencialidad de sus credenciales y de utilizar la plataforma unicamente para fines relacionados con sus funciones.'
    ]
  },
  {
    title: '3. Integraciones con terceros',
    paragraphs: [
      'El portal puede conectarse con servicios externos como Google Calendar, Cal.com, correo electronico u otras herramientas operativas para facilitar la agenda, comunicacion y seguimiento de citas.',
      'Cuando una integracion requiera autorizacion del usuario, el portal solicitara los permisos necesarios y usara la informacion obtenida solo para las finalidades mostradas al momento de la autorizacion.'
    ]
  },
  {
    title: '4. Informacion y datos tratados',
    paragraphs: [
      'La informacion gestionada en el portal puede incluir datos de usuarios internos, prospectos, candidatos, citas, notas, estados de seguimiento y datos necesarios para la operacion comercial.',
      'El tratamiento de datos personales se realiza conforme a la Politica de Privacidad publicada por Lealtia y a las obligaciones aplicables en materia de proteccion de datos.'
    ]
  },
  {
    title: '5. Restricciones de uso',
    paragraphs: [
      'Queda prohibido usar el portal para fines ajenos a la operacion autorizada, compartir accesos, intentar evadir controles de seguridad, extraer informacion sin autorizacion o afectar la disponibilidad del servicio.',
      'Lealtia puede suspender o revocar accesos cuando detecte uso indebido, riesgo de seguridad o incumplimiento de estos terminos.'
    ]
  },
  {
    title: '6. Disponibilidad del servicio',
    paragraphs: [
      'Lealtia procura mantener el portal disponible y funcional; sin embargo, pueden existir interrupciones por mantenimiento, actualizaciones, incidentes tecnicos o dependencia de servicios externos.',
      'Cuando sea posible, se notificaran mantenimientos o cambios relevantes por los canales operativos correspondientes.'
    ]
  },
  {
    title: '7. Cambios a los terminos',
    paragraphs: [
      'Lealtia puede actualizar estos terminos para reflejar cambios operativos, legales, tecnicos o de seguridad.',
      'La version vigente estara disponible en esta pagina y sera aplicable desde su publicacion, salvo que se indique una fecha posterior.'
    ]
  },
  {
    title: '8. Contacto',
    paragraphs: [
      'Para dudas sobre estos terminos, uso del portal o integraciones autorizadas, los usuarios deben contactar al administrador interno de Lealtia o al canal de soporte definido para la operacion.'
    ]
  }
]

export default function TermsOfServicePage() {
  return (
    <main className="container py-5" style={{ maxWidth: 840 }}>
      <header className="mb-4">
        <p className="text-uppercase text-muted small fw-semibold mb-2">Lealtia Portal de Asesores</p>
        <h1 className="fw-bold">Terminos de Servicio</h1>
        <p className="text-muted small mb-0">Ultima actualizacion: 12 de julio de 2026</p>
      </header>

      <section className="d-flex flex-column gap-4">
        <p>
          Estos terminos regulan el uso del Portal de Asesores Lealtia por parte de usuarios
          autorizados. Al acceder al portal, el usuario acepta utilizarlo conforme a estos terminos,
          a la legislacion aplicable y a las politicas internas de Lealtia.
        </p>

        {sections.map((section) => (
          <article key={section.title} className="d-flex flex-column gap-2">
            <h2 className="h5 fw-semibold">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mb-0">
                {paragraph}
              </p>
            ))}
          </article>
        ))}

        <p className="mb-0">
          Consulta tambien nuestra{' '}
          <Link href="/politica-privacidad">Politica de Privacidad</Link>.
        </p>
      </section>
    </main>
  )
}
