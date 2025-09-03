"use client";
import React from 'react'
import { useState } from 'react'

export default function Footer() {
  const [imgOk, setImgOk] = useState(true)
  return (
    <footer
      style={{
        marginTop: 24,
        background: '#0B2233',
        color: '#fff',
        borderTop: '1px solid rgba(255,255,255,0.15)'
      }}
      className="py-2"
    >
      <div className="container d-flex align-items-center justify-content-center gap-2">
        <span className="small text-uppercase opacity-75">powered by:</span>
        {imgOk ? (
          <picture>
            <source srcSet="/powered-by-diballo.svg" type="image/svg+xml" />
            <img
              src="/powered-by-diballo.png"
              alt="At3lier Diballo"
              height={26}
              style={{ height: 26, width: 'auto', display: 'block' }}
              onError={() => setImgOk(false)}
            />
          </picture>
        ) : (
          <span
            className="fw-semibold"
            style={{ letterSpacing: 0.2, whiteSpace: 'nowrap', opacity: 0.9 }}
            aria-label="At3lier Diballo"
          >
            At3lier Diballo
          </span>
        )}
      </div>
    </footer>
  )
}
