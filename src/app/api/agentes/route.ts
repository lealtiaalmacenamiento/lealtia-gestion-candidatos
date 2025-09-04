interface UsuarioMini { id:number; nombre?:string|null; email:string; rol:string; activo:boolean }
import { NextResponse } from 'next/server'
import { getUsuarioSesion } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabaseAdmin'

const supabase = getServiceClient()

export async function GET() {
  const usuario = await getUsuarioSesion()
  if (!usuario) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const superuser = usuario.rol === 'superusuario' || usuario.rol === 'admin'
  // Requisito: considerar como "agente" también a cualquier usuario activo cuyo email aparezca en candidatos.email_agente
  if (!superuser) {
    // Usuario normal (agente u otro rol no privilegiado): mantener comportamiento previo (retorna sólo su propio registro si es agente)
    // Si quisiera verse a sí mismo aunque no tenga rol agente (pero está referenciado), lo incluimos igualmente
    const { data: self, error: selfErr } = await supabase.from('usuarios').select('id,nombre,email,rol,activo').eq('id', usuario.id).eq('activo', true).maybeSingle()
    if (selfErr) return NextResponse.json({ error: selfErr.message }, { status: 500 })
    if (!self) return NextResponse.json([])
    // Si rol no es agente y NO está referenciado en candidatos, ocultarlo
    if (self.rol !== 'agente') {
      const ref = await supabase.from('candidatos').select('id_candidato').eq('email_agente', self.email).limit(1)
      if (ref.error) return NextResponse.json({ error: ref.error.message }, { status: 500 })
      if (!ref.data || ref.data.length === 0) return NextResponse.json([])
    }
    return NextResponse.json([self])
  }

  // Superusuario/admin: construir conjunto ampliado
  const agentesRolPromise = supabase.from('usuarios').select('id,nombre,email,rol,activo').eq('rol','agente').eq('activo', true)
  const emailsCandidatosPromise = supabase.from('candidatos').select('email_agente').not('email_agente','is', null)

  const [agentesRol, emailsCand] = await Promise.all([agentesRolPromise, emailsCandidatosPromise])
  if (agentesRol.error) return NextResponse.json({ error: agentesRol.error.message }, { status: 500 })
  if (emailsCand.error) return NextResponse.json({ error: emailsCand.error.message }, { status: 500 })

  const emailSet = new Set<string>()
  for (const r of emailsCand.data as { email_agente: string | null }[]) {
    const e = r.email_agente
    if (e) emailSet.add(e.toLowerCase())
  }
  // Filtrar emails ya cubiertos por rol agente para reducir consulta extra
  for (const u of agentesRol.data) emailSet.delete(u.email.toLowerCase())

  let extra: UsuarioMini[] = []
  if (emailSet.size > 0) {
    const emailsArray = Array.from(emailSet)
    // Supabase limita tamaño de in() (~ 1000). Asumimos <1000; si creciera se podría paginar.
    const { data: extraUsers, error: extraErr } = await supabase.from('usuarios').select('id,nombre,email,rol,activo').in('email', emailsArray).eq('activo', true)
    if (extraErr) return NextResponse.json({ error: extraErr.message }, { status: 500 })
    extra = extraUsers || []
  }

  // Unir y deduplicar
  const mergedMap = new Map<number, UsuarioMini>()
  for (const u of agentesRol.data) mergedMap.set(u.id, u)
  for (const u of extra) mergedMap.set(u.id, u)
  const merged = Array.from(mergedMap.values())
  merged.sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'') || a.email.localeCompare(b.email))

  return NextResponse.json(merged)
}