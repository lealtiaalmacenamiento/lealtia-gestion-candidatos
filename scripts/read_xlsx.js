#!/usr/bin/env node
/*
Simple XLSX reader utility.
Usage:
  node scripts/read_xlsx.js <ruta-al-archivo.xlsx> [NombreHoja]
Outputs JSON (array de filas) a stdout.
*/

import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

function exit(msg, code = 1){
  console.error(msg)
  process.exit(code)
}

async function main(){
  const file = process.argv[2]
  const sheetArg = process.argv[3]
  if(!file) exit('Falta ruta al archivo XLSX')
  const abs = path.resolve(process.cwd(), file)
  if(!fs.existsSync(abs)) exit(`No existe: ${abs}`)
  const wb = XLSX.readFile(abs, { cellDates: true, dateNF: 'yyyy-mm-dd"T"HH:MM:ss' })
  const sheetName = sheetArg && wb.SheetNames.includes(sheetArg) ? sheetArg : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  if(!ws) exit(`Hoja no encontrada: ${sheetName}`)
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
  const meta = { archivo: abs, hoja: sheetName, filas: rows.length, columnas: rows[0] ? Object.keys(rows[0]).length : 0 }
  const output = { meta, rows }
  console.log(JSON.stringify(output, null, 2))
}
main().catch(e=>{ console.error('Error leyendo XLSX', e); process.exit(1) })
