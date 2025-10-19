import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de Privacidad | Lealtia Gestion de Candidatos',
  description: 'Conoce como Lealtia Gestion de Candidatos protege la informacion personal de sus usuarios y prospectos.'
}

const sections: Array<{ title: string; paragraphs: string[] }> = [
  {
    title: '1. Informacion que recabamos',
    paragraphs: [
      'Dentro de Lealtia Gestion de Candidatos recopilamos datos de usuarios internos (administradores, supervisores, agentes) tales como nombre, correo electronico corporativo, rol, identificador de autenticacion y preferencias operativas.',
      'Respecto de prospectos y candidatos almacenamos la informacion necesaria para coordinar el proceso comercial, incluyendo nombre, medios de contacto, historial de citas, notas operativas, documentos adjuntos y resultado de seguimiento.',
      'La plataforma registra adicionalmente metadatos tecnicos (direccion IP, dispositivo, fecha y hora de acceso, acciones relevantes) para auditoria y seguridad.'
    ]
  },
  {
    title: '2. Finalidades del tratamiento',
    paragraphs: [
      'Utilizamos la informacion personal para administrar el pipeline de candidatos, coordinar agendas y reuniones, enviar confirmaciones y recordatorios por correo, emitir reportes de seguimiento y mantener la seguridad de la aplicacion.',
      'Cuando activas la integracion con Google Meet almacenamos de forma cifrada los tokens necesarios para generar enlaces automaticamente. Las reuniones de Zoom o Microsoft Teams se capturan manualmente; solo guardamos el enlace, ID y contraseña que proporciones.'
    ]
  },
  {
    title: '3. Bases legales del tratamiento',
    paragraphs: [
      'Tratamos los datos personales con base en la relacion contractual con las empresas que utilizan Lealtia Gestion de Candidatos, el cumplimiento de obligaciones legales aplicables en Mexico (LFPDPPP) y nuestro interes legitimo de proveer una plataforma segura y eficiente. Cuando una actividad requiera consentimiento expreso, lo solicitaremos previamente.'
    ]
  },
  {
    title: '4. Servicios y terceros involucrados',
    paragraphs: [
      'La informacion se aloja en Supabase (PostgreSQL) y se sirve mediante la infraestructura de Vercel. Para correo usamos proveedores como Gmail o servicios SMTP configurados por el cliente. Las integraciones opcionales pueden comunicarse con APIs de Google, Microsoft o Zoom segun cada caso.',
      'Todos los proveedores operan bajo contratos que obligan a proteger la informacion. No comercializamos la informacion personal con terceros ajenos al servicio.'
    ]
  },
  {
    title: '5. Conservacion y seguridad',
    paragraphs: [
      'Conservamos los datos mientras exista una cuenta activa o un contrato vigente con la empresa cliente, y posteriormente por el periodo necesario para cumplir obligaciones fiscales o auditorias. Una vez vencidos dichos plazos, los datos se eliminan o anonimizan de manera segura.',
      'Aplicamos controles de acceso basados en roles, autenticacion mediante Supabase Auth, bitacoras de acciones, cifrado TLS en transito y copias de seguridad. Recomendamos a los usuarios mantener contraseñas seguras y revocar accesos cuando ya no sean necesarios.'
    ]
  },
  {
    title: '6. Derechos de los titulares',
    paragraphs: [
      'Los usuarios internos y prospectos pueden ejercer derechos ARCO (acceso, rectificacion, cancelacion y oposicion) enviando su solicitud a privacidad@lealtia.com.mx o al responsable designado por la empresa que opera la plataforma.',
      'Atenderemos las solicitudes dentro de los plazos establecidos por la LFPDPPP. En algunos casos necesitaremos validar la identidad del solicitante o pedir informacion adicional para localizar los registros.'
    ]
  },
  {
    title: '7. Transferencias internacionales',
    paragraphs: [
      'Nuestros proveedores de infraestructura pueden ubicarse fuera de Mexico (principalmente Estados Unidos y la Union Europea). Implementamos salvaguardas contractuales y tecnicas para garantizar que la informacion recibira el mismo nivel de proteccion independientemente de su ubicacion.'
    ]
  },
  {
    title: '8. Actualizaciones a esta politica',
    paragraphs: [
      'Podemos modificar esta politica para reflejar cambios en la legislacion, proveedores o funcionalidades de Lealtia Gestion de Candidatos. Publicaremos la version vigente en esta pagina e indicaremos la fecha de ultima revision.'
    ]
  },
  {
    title: '9. Contacto y responsable',
    paragraphs: [
      'El responsable del tratamiento es Lealtia Gestion de Candidatos. Para cualquier duda sobre esta politica o para ejercer tus derechos, contactanos en privacidad@lealtia.com.mx. Tambien puedes dirigirte al area de cumplimiento de tu empresa para canalizar la solicitud.'
    ]
  }
]

export default function PrivacyPolicyPage() {
  return (
    <main className="container py-5" style={{ maxWidth: 840 }}>
      <header className="mb-4">
        <h1 className="fw-bold">Politica de Privacidad</h1>
        <p className="text-muted small mb-0">Ultima actualizacion: {new Date().toLocaleDateString('es-MX')}</p>
      </header>
      <section className="d-flex flex-column gap-4">
        <p>
          En Lealtia Gestion de Candidatos valoramos la confianza de nuestros usuarios. Esta politica describe de forma clara como recopilamos, usamos, protegemos y compartimos la informacion personal dentro de la plataforma.
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
      </section>
    </main>
  )
}
