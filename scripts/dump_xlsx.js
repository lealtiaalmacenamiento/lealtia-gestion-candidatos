#!/usr/bin/env node
/** Dump estructurado de un XLSX con múltiples hojas. */
import fs from 'fs'
import path from 'path'
import * as XLSXAll from 'xlsx'
// Normalizar export (algunas builds usan export default, otras named)
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
const XLSX = (XLSXAll.default && Object.keys(XLSXAll).length===1) ? XLSXAll.default : XLSXAll

function slug(s){ return s.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40) || 'hoja' }

function findHeaderRow(ws, requiredHeaders){
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  for(let r=range.s.r; r<=range.e.r; r++){
    let hits = 0
    const values = []
    for(let c=range.s.c; c<=range.e.c; c++){
      const addr = XLSX.utils.encode_cell({r,c})
      const cell = ws[addr]
      if(!cell) continue
      let raw = cell.v
      if(raw === undefined || raw === null) continue
      if(typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') continue
      const v = String(raw).trim()
      if(v) values.push(v)
    }
    requiredHeaders.forEach(h=>{ if(values.some(v=> v.toLowerCase() === h.toLowerCase())) hits++ })
    if(hits >= Math.ceil(requiredHeaders.length * 0.5)) return r
  }
  return -1
}

function extractMetaAbove(ws, headerRow){
  if(headerRow <= 0) return []
  const meta = []
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  for(let r=0; r<headerRow; r++){
    const rowVals = []
    for(let c=0; c<=range.e.c && c<40; c++){
      const addr = XLSX.utils.encode_cell({r,c})
      const cell = ws[addr]
      const v = cell? (cell.w || cell.v || '').toString().trim(): ''
      rowVals.push(v)
    }
    if(rowVals.some(v=>v)) meta.push(rowVals)
  }
  return meta
}

function collectComments(ws){
  const out = []
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  for(let r=range.s.r; r<=range.e.r; r++){
    for(let c=range.s.c; c<=range.e.c; c++){
      const addr = XLSX.utils.encode_cell({r,c})
      const cell = ws[addr]
      if(cell && cell.c && Array.isArray(cell.c) && cell.c.length){
        out.push({ cell: addr, text: cell.c.map(x=> (x.t||'').trim()).join(' | ') })
      }
    }
  }
  return out
}

function sheetToObjects(ws, headerRow){
  if(headerRow === -1) return { headers: [], rows: [] }
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1')
  const headers = []
  for(let c=range.s.c; c<=range.e.c; c++){
    const addr = XLSX.utils.encode_cell({r:headerRow,c})
    const cell = ws[addr]
    const v = cell? (cell.w || cell.v || '').toString().trim(): ''
    if(v) headers.push({ index:c, name:v })
  }
  const namesSeen = new Set()
  headers.forEach(h=>{ let base=h.name; let i=1; while(namesSeen.has(h.name)){ h.name = `${base}_${++i}` } namesSeen.add(h.name) })
  const rows = []
  for(let r=headerRow+1; r<=range.e.r; r++){
    const obj = {}; let empty=true
    headers.forEach(h=>{ const addr = XLSX.utils.encode_cell({r,c:h.index}); const cell=ws[addr]; let v = cell? (cell.v??'').toString(): ''; v=v.trim(); if(v) empty=false; obj[h.name]=v })
    if(!empty) rows.push(obj)
  }
  return { headers: headers.map(h=>h.name), rows }
}

function main(){
  const file = process.argv[2]
  if(!file){ console.error('Uso: node scripts/dump_xlsx.js <archivo.xlsx>'); process.exit(1) }
  const abs = path.resolve(file)
  if(!fs.existsSync(abs)){ console.error('No existe archivo:', abs); process.exit(1) }
  const reader = (XLSX && XLSX.readFile) || (XLSX && XLSX.default && XLSX.default.readFile)
  if(!reader){
    console.error('No se encontró readFile en módulo xlsx. Claves disponibles:', Object.keys(XLSX||{}))
    process.exit(1)
  }
  const wb = reader(abs, { cellDates:true, cellStyles:true, sheetStubs:true })
  const index = []
  const outDir = path.dirname(abs)
  wb.SheetNames.forEach((sheetName,i)=>{
    const ws = wb.Sheets[sheetName]; if(!ws) return
    const headerRow = findHeaderRow(ws, ['ID','No. Póliza','Correo'])
    const meta = extractMetaAbove(ws, headerRow)
    const { headers, rows } = sheetToObjects(ws, headerRow)
    const comments = collectComments(ws)
    const slugName = `${String(i+1).padStart(2,'0')}_${slug(sheetName)}`
    const jsonPath = path.join(outDir, `${slugName}.json`)
    const csvPath = path.join(outDir, `${slugName}.csv`)
    fs.writeFileSync(jsonPath, JSON.stringify({ sheet: sheetName, headerRow, meta, headers, rowCount: rows.length, comments, sample: rows.slice(0,10), allRows: rows }, null, 2),'utf8')
    if(headers.length){
      const csvLines = [headers.join(',')].concat(rows.map(r=> headers.map(h=> { const val=(r[h]??'').toString().replace(/"/g,'""'); return /[",\n]/.test(val)?`"${val}"`:val }).join(',')))
      fs.writeFileSync(csvPath, csvLines.join('\n'),'utf8')
    }
    index.push({ sheet: sheetName, slug: slugName, json: path.basename(jsonPath), csv: headers.length? path.basename(csvPath): null, headerRow, headers, rows: rows.length, metaRows: meta.length, comments: comments.length })
  })
  fs.writeFileSync(path.join(outDir,'dump_index.json'), JSON.stringify({ source: path.basename(abs), sheets: index }, null, 2))
  console.log('Dump completo. Ver docs/xlsx_ref/dump_index.json')
}

main()
