interface UsuarioMini { id:number; id_auth?: string | null; nombre?:string|null; email:string; rol:string; activo:boolean; clientes_count?: number }
type MetaRow = { usuario_id: number; fecha_conexion_text: string | null; objetivo: number | null }
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
  const { data: self, error: selfErr } = await supabase.from('usuarios').select('id,id_auth,nombre,email,rol,activo').eq('id', usuario.id).eq('activo', true).maybeSingle()
    if (selfErr) return NextResponse.json({ error: selfErr.message }, { status: 500 })
    if (!self) return NextResponse.json([])
    // Si rol no es agente y NO está referenciado en candidatos, ocultarlo
    if (self.rol !== 'agente') {
      const ref = await supabase.from('candidatos').select('id_candidato').eq('email_agente', self.email).limit(1)
      if (ref.error) return NextResponse.json({ error: ref.error.message }, { status: 500 })
      if (!ref.data || ref.data.length === 0) return NextResponse.json([])
    }
    // Enriquecer con badges y conteos para el propio usuario
    let clientes_count = 0
    let puntos = 0
    let comisiones_mxn_total = 0
    if (self.id_auth) {
      const cc = await supabase.from('clientes').select('asesor_id').eq('asesor_id', self.id_auth).eq('activo', true)
      if (cc.error) return NextResponse.json({ error: cc.error.message }, { status: 500 })
      clientes_count = (cc.data || []).length
      const pj = await supabase
        .from('polizas')
        .select('estatus, puntos_actuales, poliza_puntos_cache(base_factor,prima_anual_snapshot), clientes!inner(asesor_id,activo)')
        .eq('clientes.asesor_id', self.id_auth)
        .eq('clientes.activo', true)
      if (pj.error) return NextResponse.json({ error: pj.error.message }, { status: 500 })
      for (const r of (pj.data as unknown as Array<{ estatus?: string|null; puntos_actuales: number|null; poliza_puntos_cache?: { base_factor?: number|null; prima_anual_snapshot?: number|null }|null; clientes: { asesor_id: string|null } }> | null) || []) {
        const add = typeof r.puntos_actuales === 'number' ? r.puntos_actuales : 0
        puntos += add
        // Comisión total: solo pólizas en vigor, con snapshot de prima y porcentaje válidos
        const pct = r?.poliza_puntos_cache?.base_factor
        const prima = r?.poliza_puntos_cache?.prima_anual_snapshot
        if (r?.estatus === 'EN_VIGOR' && typeof pct === 'number' && typeof prima === 'number') {
          comisiones_mxn_total += Number(((prima * pct) / 100).toFixed(2))
        }
      }
    }
    const meta = await supabase.from('agente_meta').select('usuario_id, fecha_conexion_text, objetivo').eq('usuario_id', self.id).maybeSingle()
    if (meta.error && meta.error.code !== 'PGRST116') { // ignore no rows
      return NextResponse.json({ error: meta.error.message }, { status: 500 })
    }
    const m = (meta.data as MetaRow | null) || { usuario_id: self.id, fecha_conexion_text: null, objetivo: null }
    const mesesGraduacion = (() => {
      const t = (m.fecha_conexion_text || '').trim()
      if (!t) return null
      const parts = t.split('/')
      if (parts.length !== 3) return null
      const d = Number(parts[0]); const mo = Number(parts[1]); const y = Number(parts[2])
      if (!isFinite(d) || !isFinite(mo) || !isFinite(y)) return null
      const mesActual = new Date()
      const diff = (mesActual.getFullYear() * 12 + mesActual.getMonth() + 1) - (y * 12 + mo)
      return 12 - diff
    })()
    const polizasParaGraduacion = Math.max(0, 36 - puntos)
    const necesitaMensual = (mesesGraduacion && mesesGraduacion > 0) ? Math.ceil(polizasParaGraduacion / mesesGraduacion) : null
    const enriched = {
      ...self,
      clientes_count,
      badges: {
        polizas_en_conteo: puntos,
        conexion: m.fecha_conexion_text || null,
        meses_para_graduacion: mesesGraduacion,
        polizas_para_graduacion: polizasParaGraduacion,
        necesita_mensualmente: necesitaMensual,
        objetivo: (m.objetivo ?? 36),
        comisiones_mxn: comisiones_mxn_total,
      }
    }
    return NextResponse.json([enriched])
  }

  // Superusuario/admin: construir conjunto ampliado
  const agentesRolPromise = supabase.from('usuarios').select('id,id_auth,nombre,email,rol,activo').eq('rol','agente').eq('activo', true)
  const emailsCandidatosPromise = supabase.from('candidatos').select('email_agente').not('email_agente','is', null)
  // Precalcular conteo de clientes por asesor_id (id_auth) sin usar group() para evitar incompatibilidades de tipos
  const clientesCountPromise = supabase
    .from('clientes')
    .select('asesor_id')
    .not('asesor_id','is', null)
    .eq('activo', true)
  // Sumar puntos_total por agente (desde poliza_puntos_cache join polizas -> clientes.asesor_id)
  const puntosJoinPromise = supabase
    .from('polizas')
    .select('id, estatus, puntos_actuales, poliza_puntos_cache(base_factor,prima_anual_snapshot), clientes!inner(asesor_id,activo)')
    .eq('clientes.activo', true)

  const metaPromise = supabase.from('agente_meta').select('usuario_id, fecha_conexion_text, objetivo')
  const [agentesRol, emailsCand, clientesCount, puntosJoin, metaRes] = await Promise.all([agentesRolPromise, emailsCandidatosPromise, clientesCountPromise, puntosJoinPromise, metaPromise])
  if (agentesRol.error) return NextResponse.json({ error: agentesRol.error.message }, { status: 500 })
  if (emailsCand.error) return NextResponse.json({ error: emailsCand.error.message }, { status: 500 })
  if (clientesCount.error) return NextResponse.json({ error: clientesCount.error.message }, { status: 500 })
  if (puntosJoin.error) return NextResponse.json({ error: puntosJoin.error.message }, { status: 500 })
  if (metaRes.error) return NextResponse.json({ error: metaRes.error.message }, { status: 500 })

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
  const { data: extraUsers, error: extraErr } = await supabase.from('usuarios').select('id,id_auth,nombre,email,rol,activo').in('email', emailsArray).eq('activo', true)
    if (extraErr) return NextResponse.json({ error: extraErr.message }, { status: 500 })
    extra = extraUsers || []
  }

  // Mapear conteos por asesor_id (id_auth)
  const countMap = new Map<string, number>()
  for (const r of (clientesCount.data as unknown as Array<{ asesor_id: string|null }> | null) || []) {
    if (!r || !r.asesor_id) continue
    const key = String(r.asesor_id)
    countMap.set(key, (countMap.get(key) || 0) + 1)
  }
  // Mapear puntos por asesor_id (sum puntos_actuales) y comisiones en MXN
  const puntosMap = new Map<string, number>()
  const comisionesMap = new Map<string, number>()
  for (const r of (puntosJoin.data as unknown as Array<{ estatus?: string|null; puntos_actuales: number | null; poliza_puntos_cache?: { base_factor?: number|null; prima_anual_snapshot?: number|null }|null; clientes: { asesor_id: string|null } }> | null) || []) {
    const a = r?.clientes?.asesor_id
    if (!a) continue
    const current = puntosMap.get(a) || 0
    const add = typeof r.puntos_actuales === 'number' ? r.puntos_actuales : 0
    puntosMap.set(a, current + add)
    const pct = r?.poliza_puntos_cache?.base_factor
    const prima = r?.poliza_puntos_cache?.prima_anual_snapshot
    if (r?.estatus === 'EN_VIGOR' && typeof pct === 'number' && typeof prima === 'number') {
      const cprev = comisionesMap.get(a) || 0
      comisionesMap.set(a, Number((cprev + (prima * pct) / 100).toFixed(2)))
    }
  }
  // Mapear meta por usuario_id
  const metaMap = new Map<number, MetaRow>()
  for (const m of (metaRes.data as unknown as MetaRow[] | null) || []) metaMap.set(m.usuario_id, m)

  // Unir y deduplicar
  const mergedMap = new Map<number, UsuarioMini>()
  for (const u of agentesRol.data) mergedMap.set(u.id, { ...u, clientes_count: u.id_auth ? (countMap.get(u.id_auth) || 0) : 0 })
  for (const u of extra) mergedMap.set(u.id, { ...u, clientes_count: u.id_auth ? (countMap.get(u.id_auth) || 0) : 0 })
  // Construir arreglo y anexar badges calculados
  const merged = Array.from(mergedMap.values()).map(a => {
    const puntos = a.id_auth ? (puntosMap.get(a.id_auth) || 0) : 0
  const comisiones = a.id_auth ? (comisionesMap.get(a.id_auth) || 0) : 0
    const meta = metaMap.get(a.id) || { usuario_id: a.id, fecha_conexion_text: null, objetivo: null }
    // Derivados: meses_graduacion y polizas_para_graduacion
    const mesesGraduacion = (() => {
      // conexión en formato D/M/YYYY
      const t = (meta.fecha_conexion_text || '').trim()
      if (!t) return null
      const m = t.split('/')
      if (m.length !== 3) return null
      const d = Number(m[0]); const mo = Number(m[1]); const y = Number(m[2])
      if (!isFinite(d) || !isFinite(mo) || !isFinite(y)) return null
      const mesActual = new Date()
      const diff = (mesActual.getFullYear() * 12 + mesActual.getMonth() + 1) - (y * 12 + mo) // meses transcurridos desde conexión (mes 1-12)
      const val = 12 - diff
      return val
    })()
  const polizasParaGraduacion = Math.max(0, 36 - puntos)
  const necesitaMensual = (mesesGraduacion && mesesGraduacion > 0) ? Math.ceil(polizasParaGraduacion / mesesGraduacion) : null
    return {
      ...a,
      clientes_count: a.clientes_count,
      badges: {
        polizas_en_conteo: puntos,
        conexion: meta.fecha_conexion_text || null,
        meses_para_graduacion: mesesGraduacion,
        polizas_para_graduacion: polizasParaGraduacion,
        necesita_mensualmente: necesitaMensual,
        objetivo: (meta.objetivo ?? 36),
        comisiones_mxn: comisiones,
      }
    }
  })
  merged.sort((a,b)=> (a.nombre||'').localeCompare(b.nombre||'') || a.email.localeCompare(b.email))

  return NextResponse.json(merged)
}