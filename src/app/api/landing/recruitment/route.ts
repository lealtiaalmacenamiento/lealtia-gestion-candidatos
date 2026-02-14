import { NextResponse } from 'next/server'
import { buildRecruitmentEmail, sendMail } from '@/lib/mailer'
import { getServiceClient } from '@/lib/supabaseAdmin'

// Forzar runtime Node.js para nodemailer
export const runtime = 'nodejs'

async function getRecipientEmails(): Promise<string[]> {
  const isProduction = process.env.VERCEL_ENV === 'production'
  
  // En desarrollo, solo enviar a orozco.jaime25@gmail.com
  if (!isProduction) {
    return ['orozco.jaime25@gmail.com']
  }
  
  // En producción: obtener supervisores + ing.zamarripaa@gmail.com
  try {
    const supabase = getServiceClient()
    const { data: supervisores, error } = await supabase
      .from('usuarios')
      .select('email')
      .eq('rol', 'supervisor')
      .eq('activo', true)
    
    if (error) {
      console.error('[recruitment API] Error obteniendo supervisores:', error)
      // Fallback si hay error
      return ['ing.zamarripaa@gmail.com']
    }
    
    const emails = supervisores?.map(s => s.email).filter(Boolean) || []
    
    // Agregar ing.zamarripaa@gmail.com si no está en la lista
    if (!emails.includes('ing.zamarripaa@gmail.com')) {
      emails.push('ing.zamarripaa@gmail.com')
    }
    
    return emails.length > 0 ? emails : ['ing.zamarripaa@gmail.com']
  } catch (error) {
    console.error('[recruitment API] Error al obtener destinatarios:', error)
    return ['ing.zamarripaa@gmail.com']
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { nombre, ciudad, edad, telefono, email, interes } = body

    // Validación básica
    if (!nombre || !ciudad || !edad || !telefono || !email || !interes) {
      return NextResponse.json(
        { error: 'Faltan campos requeridos' },
        { status: 400 }
      )
    }

    // Construir email
    const { subject, html, text } = buildRecruitmentEmail({
      nombre,
      ciudad,
      edad,
      telefono,
      email,
      interes
    })

    // Obtener destinatarios
    const recipients = await getRecipientEmails()
    console.log('[recruitment API] Enviando a:', recipients.join(', '))
    
    // Enviar email a todos los destinatarios
    await sendMail({
      to: recipients.join(', '),
      subject,
      html,
      text
    })

    return NextResponse.json({ 
      success: true,
      message: 'Solicitud enviada correctamente'
    })
  } catch (error) {
    console.error('[recruitment API] Error:', error)
    return NextResponse.json(
      { error: 'Error al enviar la solicitud' },
      { status: 500 }
    )
  }
}
