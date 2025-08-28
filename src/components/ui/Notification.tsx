import { useEffect } from 'react'

export default function Notification({ message, type = 'success', onClose, timeout=3000 }: { message: string, type?: 'success'|'error', onClose?:()=>void, timeout?:number }) {
  useEffect(()=>{ if(!onClose) return; const id=setTimeout(()=> onClose(), timeout); return ()=> clearTimeout(id) },[onClose, timeout])
  return (
    <div style={{position:'fixed', top:10, right:10, zIndex:1050, minWidth:240}}>
  <div className={`toast shadow-sm border ${type==='error'?'border-danger':'border-success'}`} style={{display:'block', background:'#fff'}}>
        <div className="toast-body d-flex justify-content-between align-items-start">
          <div className={type==='error'? 'text-danger':'text-success'}>{message}</div>
          {onClose && <button type="button" className="btn-close ms-2" onClick={onClose}></button>}
        </div>
      </div>
    </div>
  )
}
