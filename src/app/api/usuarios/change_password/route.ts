import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { logAccion } from '@/lib/logger'

export const dynamic = 'force-dynamic'

function isStrongPassword(pw: string) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw)
}

export async function POST(req: Request) {
  try {
    const { newPassword } = await req.json()
    if(!newPassword) return NextResponse.json({ error: 'Nueva contraseña requerida' }, { status:400 })
    if(!isStrongPassword(newPassword)) return NextResponse.json({ error: 'Password débil (min 8, mayúscula, minúscula y número)' }, { status:400 })
    // Adaptador explícito (igual que /api/login) evita errores de acceso sync/async
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
        remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) }
      }
    })
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if(authErr || !user?.email) {
      console.warn('[POST /api/usuarios/change_password] No autenticado', { authErr: authErr?.message })
      // Diagnóstico: listar cookies relevantes (sin valores completos por seguridad)
      try {
        const names = cookieStore.getAll().map(c=>c.name).filter(n=>n.includes('sb-'))
        console.warn('[POST /api/usuarios/change_password] cookies presentes', names)
      } catch {}
      return NextResponse.json({ error: 'No autenticado' }, { status:401 })
    }

    // Actualizar password en Auth
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword })
    if(updErr) return NextResponse.json({ error: updErr.message }, { status:400 })

    // Limpiar flag must_change_password en tabla usuarios (si existe la columna)
  await supabase.from('usuarios').update({ must_change_password: false }).eq('email', user.email)

    await logAccion('cambio_password', { usuario: user.email, tabla_afectada: 'usuarios', snapshot: { email: user.email } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error? e.message:'Error interno' }, { status:500 })
  }
}