"use client";
import React from 'react';

export default function FullScreenLoader({ text = 'Cargando...' }: { text?: string }) {
  return (
    <div className="d-flex justify-content-center align-items-center vh-100">
      <div className="spinner-border text-primary" role="status">
        <span className="visually-hidden">{text}</span>
      </div>
      <span className="ms-3">{text}</span>
    </div>
  );
}
