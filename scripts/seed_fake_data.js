/* eslint-disable @typescript-eslint/no-require-imports */
/* Seed demo data: 50 prospectos, 50 clientes, 3 pólizas por cliente */
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en variables de entorno')
  process.exit(1)
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function pick(arr) { return arr[randInt(0, arr.length - 1)] }
function pad(n, w = 6) { return n.toString().padStart(w, '0') }
function randomDate(start, end) { return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())) }
function isoDate(d) { return d.toISOString().slice(0,10) }
function randomPhone() { return '8' + pad(randInt(100000000, 999999999), 9) }

const firstNames = ['JUAN','MARIA','JOSE','LAURA','ANA','PEDRO','KAREN','LUCIA','MARIO','LUIS','PEPE','LOLA','RITA','SARA','IVAN','OMAR','ELSA','DANIEL','DAVID','ROBERTO','RAQUEL']
const middleNames = ['', '', '', 'ALFREDO','EDUARDO','CARLOS','DANIEL','FERNANDO','ADRIAN','NICOLAS']
const lastNames = ['PEREZ','GOMEZ','LOPEZ','RAMIREZ','HERNANDEZ','MARTINEZ','TORRES','RODRIGUEZ','LEPE','NIPI','DIAZ','CRUZ','MORALES']
const estadosPros = ['pendiente','con_cita','seguimiento','descartado']
const formasPago = ['MODO_DIRECTO','CARGO_AUTOMATICO']
const periodicidades = ['M','S','T','A']

function buildNombre() {
  const pn = pick(firstNames)
  const sn = pick(middleNames)
  const pa = pick(lastNames)
  const sa = pick(lastNames)
  return {
    primer_nombre: pn,
    segundo_nombre: sn || null,
    primer_apellido: pa,
    segundo_apellido: sa,
  }
}

async function fetchAgentes() {
  const { data, error } = await supabase.from('usuarios').select('id, id_auth, rol, activo')
  if (error) throw error
  const agentes = (data || []).filter(u => u.activo && ['agente','superusuario','admin','supervisor','super_usuario'].includes((u.rol||'').toLowerCase()))
  if (!agentes.length) throw new Error('No hay usuarios activos para asignar (agentes/supers)')
  return agentes
}

async function fetchProductos() {
  const { data, error } = await supabase.from('producto_parametros').select('id, moneda, activo').eq('activo', true)
  if (error) throw error
  if (!data || !data.length) throw new Error('No hay producto_parametros activos')
  return data
}

function genClientes(count, agentes) {
  const out = []
  for (let i = 0; i < count; i++) {
    const n = buildNombre()
    const asesor = pick(agentes)
    const email = `${n.primer_nombre.toLowerCase()}${pad(randInt(1,9999),4)}@demo.local`
    const tel = randomPhone()
    const fecha = isoDate(randomDate(new Date(1960,0,1), new Date(2005,11,31)))
    out.push({
      ...n,
      telefono_celular: tel,
      correo: email,
      fecha_nacimiento: fecha,
      asesor_id: asesor.id_auth,
    })
  }
  return out
}

function genProspectos(count, agentes) {
  const year = new Date().getFullYear()
  const out = []
  for (let i = 0; i < count; i++) {
    const agente = pick(agentes)
    const n = buildNombre()
    const nombre = [n.primer_nombre, n.segundo_nombre, n.primer_apellido].filter(Boolean).join(' ')
    const estado = pick(estadosPros)
    const withCita = Math.random() < 0.4
    const fechaCita = withCita ? new Date(Date.now() + randInt(1,20)*24*3600*1000 + randInt(9,18)*3600*1000) : null
    out.push({
      agente_id: agente.id,
      anio: year,
      semana_iso: 36,
      nombre,
      telefono: randomPhone(),
      notas: 'dato de prueba',
      estado,
      fecha_cita: fechaCita ? fechaCita.toISOString() : null,
    })
  }
  return out
}

let seqPol = Date.now() % 1000000
function genPolizasForCliente(clienteId, productos) {
  const out = []
  for (let j = 0; j < 3; j++) {
    const prod = pick(productos)
    const moneda = prod.moneda || 'MXN'
    const numero = `DEMO-${pad(++seqPol, 7)}`
    const emision = randomDate(new Date(Date.now() - 365*24*3600*1000), new Date())
    const renov = new Date(emision.getTime() + 365*24*3600*1000)
    const prima = moneda === 'USD' ? randInt(100, 10000) : moneda === 'UDI' ? randInt(100, 500000) : randInt(100, 20000)
    out.push({
      cliente_id: clienteId,
      producto_parametro_id: prod.id,
      numero_poliza: numero,
      estatus: 'EN_VIGOR',
      fecha_emision: isoDate(emision),
      fecha_renovacion: isoDate(renov),
      forma_pago: pick(formasPago),
      periodicidad_pago: pick(periodicidades),
      dia_pago: randInt(1, 28),
      meses_check: {},
      prima_input: prima,
      prima_moneda: moneda,
      sa_input: Math.random() < 0.5 ? randInt(50000, 1000000) : null,
      sa_moneda: Math.random() < 0.5 ? moneda : null,
    })
  }
  return out
}

async function main() {
  console.log('→ Seed: iniciando')
  const agentes = await fetchAgentes()
  const productos = await fetchProductos()

  // 1) Prospectos (50)
  const prospectos = genProspectos(50, agentes)
  const pRes = await supabase.from('prospectos').insert(prospectos)
  if (pRes.error) throw pRes.error
  console.log(`✓ Prospectos insertados: ${prospectos.length}`)

  // 2) Clientes (50)
  const clientes = genClientes(50, agentes)
  // Insertar en batch y recuperar ids
  const cRes = await supabase.from('clientes').insert(clientes).select('id')
  if (cRes.error) throw cRes.error
  const clienteIds = (cRes.data || []).map(r => r.id)
  console.log(`✓ Clientes insertados: ${clienteIds.length}`)

  // 3) Pólizas (3 por cliente)
  const allPolizas = []
  for (const cid of clienteIds) {
    allPolizas.push(...genPolizasForCliente(cid, productos))
  }
  // Insertar en tandas para evitar payload grande
  const chunk = 100
  for (let i = 0; i < allPolizas.length; i += chunk) {
    const part = allPolizas.slice(i, i+chunk)
    const polRes = await supabase.from('polizas').insert(part)
    if (polRes.error) throw polRes.error
  }
  console.log(`✓ Pólizas insertadas: ${allPolizas.length}`)

  console.log('✔ Seed completado')
}

main().catch(err => { console.error('Seed ERROR:', err); process.exit(1) })
