import { NextResponse } from 'next/server'
import { buildRecruitmentEmail, sendMail } from '@/lib/mailer'

// Forzar runtime Node.js para nodemailer
export const runtime = 'nodejs'

function getRecipientEmail(): string {
  const isProduction = process.env.VERCEL_ENV === 'production'
  return isProduction ? 'ing.zamarripaa@gmail.com' : 'orozco.jaime25@gmail.com'
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

    // Construir y enviar email
    const { subject, html, text } = buildRecruitmentEmail({
      nombre,
      ciudad,
      edad,
      telefono,
      email,
      interes
    })

    const recipientEmail = getRecipientEmail()
    
    await sendMail({
      to: recipientEmail,
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
