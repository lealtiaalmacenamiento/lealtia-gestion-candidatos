"use client";
import React from 'react'

export default function Footer() {
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
        <picture>
          <source srcSet="/powered-by-diballo.svg" type="image/svg+xml" />
          <img
            src="/powered-by-diballo.png"
            alt="At3lier Diballo"
            style={{ height: 26, width: 'auto', display: 'block' }}
          />
        </picture>
      </div>
    </footer>
  )
}
