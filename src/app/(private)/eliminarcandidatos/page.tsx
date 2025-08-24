'use client'
import React from 'react'
import BasePage from '@/components/BasePage'

interface CandidatoEliminado { id_candidato:number; candidato:string; mes:string; efc:string; ct:string; fecha_eliminacion?:string; usuario_que_actualizo?:string }

export default function CandidatosEliminadosPage(){
  const [data,setData]=React.useState<CandidatoEliminado[]>([])
  const [loading,setLoading]=React.useState(true)
  const [error,setError]=React.useState<string|null>(null)
  React.useEffect(()=>{(async()=>{
    try{
      const r=await fetch('/api/candidatos?eliminados=1')
      const j=await r.json()
      if(!r.ok) throw new Error(j.error||'Error cargando eliminados')
      if(Array.isArray(j)) setData(j)
    }catch(e){ setError(e instanceof Error? e.message:'Error'); }
    finally{setLoading(false)}
  })()},[])

  return <BasePage title="Candidatos Eliminados" alert={error?{type:'danger',message:error,show:true}:undefined}>
    <div className='container py-3'>
      <h5 className='mb-3'>Candidatos eliminados</h5>
      {loading && <div>Cargando...</div>}
      {!loading && data.length===0 && !error && <div className='alert alert-info'>Sin registros eliminados</div>}
      {!loading && data.length>0 && (
        <div className='table-responsive'>
          <table className='table table-sm table-bordered'>
            <thead><tr><th>ID</th><th>Candidato</th><th>Mes</th><th>EFC</th><th>CT</th><th>Fecha eliminación</th><th>Eliminado por</th></tr></thead>
            <tbody>{data.map(c=> <tr key={c.id_candidato}><td>{c.id_candidato}</td><td>{c.candidato}</td><td>{c.mes}</td><td>{c.efc}</td><td>{c.ct}</td><td>{c.fecha_eliminacion?.slice(0,10)||''}</td><td>{c.usuario_que_actualizo||'—'}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  </BasePage>
}
