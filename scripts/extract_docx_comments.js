#!/usr/bin/env node
/**
 * Extrae comentarios (revisiones) de un archivo .docx y produce un JSON estructurado.
 * Uso: node scripts/extract_docx_comments.js ruta/al/archivo.docx [salida.json]
 */
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';

function usageAndExit(msg){
  if(msg) console.error(msg); 
  console.error('Uso: node scripts/extract_docx_comments.js input.docx [salida.json]');
  process.exit(1);
}

const inputPath = process.argv[2];
if(!inputPath) usageAndExit('Falta archivo .docx');
if(!fs.existsSync(inputPath)) usageAndExit('No existe archivo: '+inputPath);
const outputPath = process.argv[3] || path.join(path.dirname(inputPath), 'comments_dump.json');

try {
  const zip = new AdmZip(inputPath);
  const entries = zip.getEntries();

  // Core XML parts we care about
  const commentEntry = entries.find(e => e.entryName === 'word/comments.xml');
  const docEntry = entries.find(e => e.entryName === 'word/document.xml');
  if(!commentEntry){
    console.warn('El documento no contiene comments.xml (sin comentarios)');
  }
  if(!docEntry){
    usageAndExit('No se encontró document.xml');
  }

  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '', removeNSPrefix: true, trimValues: true });
  const documentXml = parser.parse(docEntry.getData().toString('utf8'));
  const commentsXml = commentEntry ? parser.parse(commentEntry.getData().toString('utf8')) : null;

  // Map comments by id
  const comments = [];
  if(commentsXml && commentsXml.comments && commentsXml.comments.comment){
    const raw = Array.isArray(commentsXml.comments.comment) ? commentsXml.comments.comment : [commentsXml.comments.comment];
    for(const c of raw){
      comments.push({
        id: c.id,
        author: c.author || null,
        date: c.date || null,
        text: extractTextFromRuns(c.p)
      });
    }
  }
  // No necesitamos un mapa commentsById por ahora; mantenemos la estructura lineal

  // Traverse document paragraphs capturing commentRangeStart/commentRangeEnd markers
  const ranges = {}; // id -> {startIdx, endIdx, text}
  const paragraphs = collectParagraphs(documentXml);
  paragraphs.forEach((p, idx) => {
    if(!p) return;
    const runs = ensureArray(p.r);
    if(runs){
      runs.forEach(r => {
        if(r.commentRangeStart && r.commentRangeStart.id !== undefined){
          const id = String(r.commentRangeStart.id);
            if(!ranges[id]) ranges[id] = { startIdx: idx, endIdx: null, textSegments: [] };
        }
        if(r.commentRangeEnd && r.commentRangeEnd.id !== undefined){
          const id = String(r.commentRangeEnd.id);
          if(!ranges[id]) ranges[id] = { startIdx: null, endIdx: idx, textSegments: [] };
          else ranges[id].endIdx = idx;
        }
      });
    }
  });

  // Collect text inside ranges (simple heuristic: from startIdx to endIdx inclusive)
  Object.entries(ranges).forEach(([, range]) => {
    if(range.startIdx != null && range.endIdx != null){
      for(let i = range.startIdx; i <= range.endIdx; i++){
        const p = paragraphs[i];
        if(p) range.textSegments.push(extractTextFromRuns(p.r));
      }
      range.text = range.textSegments.filter(Boolean).join('\n');
    } else {
      range.text = null;
    }
  });

  // Build output structure
  const output = comments.map(c => {
    const range = ranges[String(c.id)] || {};
    return {
      id: c.id,
      author: c.author,
      date: c.date,
      commentText: c.text,
      referencedText: range.text || null,
      startParagraphIndex: range.startIdx ?? null,
      endParagraphIndex: range.endIdx ?? null
    };
  });

  fs.writeFileSync(outputPath, JSON.stringify({
    source: path.basename(inputPath),
    extractedAt: new Date().toISOString(),
    totalComments: output.length,
    comments: output
  }, null, 2), 'utf8');

  console.log(`Listo. Comentarios: ${output.length}. Archivo: ${outputPath}`);
} catch(err){
  console.error('Error extrayendo comentarios:', err);
  process.exit(1);
}

// Helpers
function ensureArray(val){
  if(!val) return null; return Array.isArray(val) ? val : [val];
}
function extractTextFromRuns(p){
  if(!p) return '';
  const runs = ensureArray(p.r || p); // sometimes nested
  if(!runs) return '';
  const texts = [];
  for(const r of runs){
    if(!r) continue;
    if(r.t){
      if(typeof r.t === 'string') texts.push(r.t);
      else if(r.t['#text']) texts.push(r.t['#text']);
    }
    if(r.tab !== undefined) texts.push('\t');
    if(r.br !== undefined) texts.push('\n');
  }
  return texts.join('');
}
function collectParagraphs(doc){
  // document.body.p might be array or object
  if(!doc || !doc.document || !doc.document.body) return [];
  const body = doc.document.body;
  const ps = ensureArray(body.p) || [];
  return ps;
}
